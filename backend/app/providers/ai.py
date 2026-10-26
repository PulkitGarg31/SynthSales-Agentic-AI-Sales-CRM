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
RATE_LIMIT_COOLDOWN_S = 60  # when a rate-limited provider gives no retry hint
MAX_RATE_LIMIT_WAIT_S = 90  # longest a call waits for a rate-limited chain (covers a full Groq minute window)
OPENROUTER_REASONING_HEADROOM = 3072

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
        deadline = time.time() + MAX_RATE_LIMIT_WAIT_S
        while True:
            for name in self.chain:
                if self._cooled_down(name):
                    continue
                text, retry_after = self._call(name, prompt, system, max_tokens)
                if text:
                    return text
                if retry_after is not None:
                    # Rate-limited: bench it for as long as the provider says
                    # (Groq's per-minute token limit resets in ~1s), not a flat 60s.
                    self._cooldown[name] = time.time() + retry_after
                    logger.warning(
                        "AI backend %s rate-limited; retry in %.0fs, failing over.",
                        name, retry_after,
                    )
                # Other errors: fall through to next backend without cooldown.
            # Every backend failed. If some are only briefly rate-limited, wait
            # for the first to free up and go again - these are background
            # jobs, so a few seconds' wait beats an "AI unavailable" profile.
            pending = [self._cooldown[n] for n in self.chain if self._cooled_down(n)]
            if not pending or min(pending) > deadline:
                return ""
            time.sleep(max(0.0, min(pending) - time.time()) + 0.1)

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

    def _call(self, name: str, prompt: str, system: str, max_tokens: int) -> tuple[str, float | None]:
        """Returns (text, retry_after). retry_after is set (seconds) only when the
        backend rate-limited us; empty text then triggers failover."""
        if name == "gemini":
            return self._gemini(prompt, system, max_tokens)
        if name == "groq":
            return self._openai_compat(
                GROQ_URL, settings.groq_api_key, settings.groq_model,
                prompt, system, max_tokens,
                # gpt-oss reasons before answering; low effort spends far fewer
                # tokens, so more calls fit in the free tier's 8k tokens/minute.
                extra_body=(
                    {"reasoning_effort": "low"}
                    if settings.groq_model.startswith("openai/gpt-oss") else None
                ),
            )
        if name == "openrouter":
            return self._openai_compat(
                OPENROUTER_URL, settings.openrouter_api_key, settings.openrouter_model,
                # + headroom for the reasoning tokens (free models are limited
                # by request count, not tokens, so the extra room costs nothing).
                prompt, system, max_tokens + OPENROUTER_REASONING_HEADROOM,
                extra_headers={
                    # Optional but encouraged by OpenRouter for app attribution.
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": settings.app_name,
                },
                # Most current free models reason before answering, and those
                # tokens count against max_tokens - at the default effort they
                # can eat the whole budget and truncate the JSON. Low effort
                # keeps the answer whole; non-reasoning models ignore it.
                extra_body={"reasoning": {"effort": "low"}},
            )
        return "", None

    @staticmethod
    def _retry_after(resp: httpx.Response) -> float:
        """Seconds until a rate-limited backend may be retried: the provider's
        hint (Retry-After header, or Gemini's RetryInfo.retryDelay), else the
        default cooldown. Clamped to 1s-5min."""
        hint = resp.headers.get("retry-after")
        if not hint:
            try:
                for d in resp.json().get("error", {}).get("details", []):
                    if str(d.get("retryDelay", "")).endswith("s"):
                        hint = d["retryDelay"][:-1]
            except Exception:
                pass
        try:
            return max(1.0, min(300.0, float(hint)))
        except (TypeError, ValueError):
            return float(RATE_LIMIT_COOLDOWN_S)

    # ----------------------------------------------------------------- gemini
    def _gemini(self, prompt: str, system: str, max_tokens: int) -> tuple[str, float | None]:
        body: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.7,
                # gemini-2.5-* are thinking models and their thinking tokens count
                # against maxOutputTokens — they routinely consume ~1000 tokens and
                # truncate the real answer (→ invalid JSON / empty completions, then
                # a silent fallback). These are copywriting/classification tasks that
                # don't need reasoning, so disable thinking for full, fast, cheap output.
                "thinkingConfig": {"thinkingBudget": 0},
            },
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
                    return "", self._retry_after(resp)
                if resp.status_code != 200:
                    logger.warning("Gemini HTTP %s: %s", resp.status_code, resp.text[:300])
                    return "", None
                candidates = resp.json().get("candidates", [])
                if not candidates:
                    return "", None
                parts = candidates[0].get("content", {}).get("parts", [])
                return "".join(p.get("text", "") for p in parts).strip(), None
        except Exception as exc:  # pragma: no cover
            logger.warning("Gemini call failed: %s", exc)
            return "", None

    # ------------------------------- shared OpenAI-compatible POST (Groq, OR)
    @classmethod
    def _openai_compat(
        cls,
        url: str, api_key: str, model: str,
        prompt: str, system: str, max_tokens: int,
        extra_headers: dict | None = None,
        extra_body: dict | None = None,
    ) -> tuple[str, float | None]:
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
                        **(extra_body or {}),
                    },
                )
                if resp.status_code == 429:
                    return "", cls._retry_after(resp)
                if resp.status_code != 200:
                    logger.warning("%s HTTP %s: %s", url, resp.status_code, resp.text[:300])
                    return "", None
                choices = resp.json().get("choices", [])
                if not choices:
                    return "", None
                return (choices[0].get("message", {}).get("content") or "").strip(), None
        except Exception as exc:  # pragma: no cover
            logger.warning("%s call failed: %s", url, exc)
            return "", None


ai = AIProvider()
