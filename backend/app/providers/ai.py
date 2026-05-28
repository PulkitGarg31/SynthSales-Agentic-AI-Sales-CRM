"""AI provider — supports Gemini, Groq, and OpenRouter with automatic failover.

The provider holds an ordered chain of backends (resolved from `.env`). Each
call walks the chain; on a **rate-limit error (HTTP 429)** the current backend
is put on a short cooldown and the call automatically retries on the next one.
This means you can configure `AI_PROVIDERS=gemini,groq,openrouter` and never
see a "quota exceeded" failure as long as at least one backend has capacity.

Chain resolution:
  1. If `AI_PROVIDERS` is set, that exact comma-separated order wins (filtered
     to backends whose API keys are configured).
  2. Otherwise `AI_PROVIDER` picks a single backend; "auto" tries them in
     preference order (gemini → groq → openrouter), keeping any with keys.

All three backends are called via OpenAI-style REST APIs with httpx (no SDK
dependencies). With no keys configured, methods return "" so callers fall
back to their deterministic heuristics.
"""
from __future__ import annotations

import json
import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# How long to skip a backend after a 429, in seconds. Free-tier limits typically
# reset within a minute (RPM) or an hour/day (TPD) — 60s is a sane default that
# avoids hammering and recovers quickly for short bursts.
RATE_LIMIT_COOLDOWN_S = 60

KNOWN = {"gemini", "groq", "openrouter"}


class AIProvider:
    def __init__(self) -> None:
        self._cooldown: dict[str, float] = {}
        self.chain: list[str] = self._resolve_chain()
        if self.chain:
            logger.info("AI chain: %s", " → ".join(self._chain_repr()))

    # ------------------------------------------------------------- chain prep
    @staticmethod
    def _has_key(name: str) -> bool:
        if name == "gemini":
            return bool(settings.gemini_api_key)
        if name == "groq":
            return bool(settings.groq_api_key)
        if name == "openrouter":
            return bool(settings.openrouter_api_key)
        return False

    @staticmethod
    def _model_for(name: str) -> str:
        if name == "gemini":
            return settings.gemini_model
        if name == "groq":
            return settings.groq_model
        if name == "openrouter":
            return settings.openrouter_model
        return ""

    def _resolve_chain(self) -> list[str]:
        explicit = settings.ai_providers_list
        if explicit:
            return [p for p in explicit if p in KNOWN and self._has_key(p)]

        choice = (settings.ai_provider or "auto").lower()
        if choice in KNOWN:
            return [choice] if self._has_key(choice) else []
        # auto: preference order
        return [p for p in ("gemini", "groq", "openrouter") if self._has_key(p)]

    def _chain_repr(self) -> list[str]:
        return [f"{p}({self._model_for(p)})" for p in self.chain]

    # ----------------------------------------------------- public interface
    @property
    def available(self) -> bool:
        return bool(self.chain)

    @property
    def provider(self) -> str:
        return self.chain[0] if self.chain else "none"

    @property
    def model(self) -> str:
        return self._model_for(self.provider)

    def complete(self, prompt: str, system: str = "", max_tokens: int = 1024) -> str:
        for name in self.chain:
            if self._cooled_down(name):
                continue
            text, rate_limited = self._call(name, prompt, system, max_tokens)
            if text:
                return text
            if rate_limited:
                self._cooldown[name] = time.time() + RATE_LIMIT_COOLDOWN_S
                logger.warning(
                    "AI backend %s rate-limited; cooling down %ss, failing over.",
                    name, RATE_LIMIT_COOLDOWN_S,
                )
            # Other errors: fall through to next backend without cooldown.
        return ""

    def complete_json(self, prompt: str, system: str = "") -> dict | None:
        raw = self.complete(prompt, system=system)
        if not raw:
            return None
        try:
            start, end = raw.find("{"), raw.rfind("}")
            if start >= 0 and end > start:
                return json.loads(raw[start : end + 1])
        except Exception:
            return None
        return None

    # ----------------------------------------------------- dispatch + helpers
    def _cooled_down(self, name: str) -> bool:
        until = self._cooldown.get(name, 0)
        return time.time() < until

    def _call(self, name: str, prompt: str, system: str, max_tokens: int) -> tuple[str, bool]:
        """Returns (text, rate_limited). Empty text + rate_limited=True triggers failover."""
        if name == "gemini":
            return self._gemini(prompt, system, max_tokens)
        if name == "groq":
            return self._openai_compat(
                GROQ_URL, settings.groq_api_key, settings.groq_model,
                prompt, system, max_tokens,
            )
        if name == "openrouter":
            return self._openai_compat(
                OPENROUTER_URL, settings.openrouter_api_key, settings.openrouter_model,
                prompt, system, max_tokens,
                extra_headers={
                    # Optional but encouraged by OpenRouter for app attribution.
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": settings.app_name,
                },
            )
        return "", False

    # ----------------------------------------------------------------- gemini
    def _gemini(self, prompt: str, system: str, max_tokens: int) -> tuple[str, bool]:
        body: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        try:
            with httpx.Client(timeout=60) as client:
                resp = client.post(
                    f"{GEMINI_BASE}/models/{settings.gemini_model}:generateContent",
                    params={"key": settings.gemini_api_key},
                    json=body,
                )
                if resp.status_code == 429:
                    return "", True
                if resp.status_code != 200:
                    logger.warning("Gemini HTTP %s: %s", resp.status_code, resp.text[:300])
                    return "", False
                candidates = resp.json().get("candidates", [])
                if not candidates:
                    return "", False
                parts = candidates[0].get("content", {}).get("parts", [])
                return "".join(p.get("text", "") for p in parts).strip(), False
        except Exception as exc:  # pragma: no cover
            logger.warning("Gemini call failed: %s", exc)
            return "", False

    # ------------------------------- shared OpenAI-compatible POST (Groq, OR)
    @staticmethod
    def _openai_compat(
        url: str, api_key: str, model: str,
        prompt: str, system: str, max_tokens: int,
        extra_headers: dict | None = None,
    ) -> tuple[str, bool]:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        headers = {"Authorization": f"Bearer {api_key}"}
        if extra_headers:
            headers.update(extra_headers)
        try:
            with httpx.Client(timeout=60) as client:
                resp = client.post(
                    url,
                    headers=headers,
                    json={
                        "model": model,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": 0.7,
                    },
                )
                if resp.status_code == 429:
                    return "", True
                if resp.status_code != 200:
                    logger.warning("%s HTTP %s: %s", url, resp.status_code, resp.text[:300])
                    return "", False
                choices = resp.json().get("choices", [])
                if not choices:
                    return "", False
                return (choices[0].get("message", {}).get("content") or "").strip(), False
        except Exception as exc:  # pragma: no cover
            logger.warning("%s call failed: %s", url, exc)
            return "", False


ai = AIProvider()
