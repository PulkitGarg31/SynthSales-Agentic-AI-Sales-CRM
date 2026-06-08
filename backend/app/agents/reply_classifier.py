"""Reply Detection & Intent — the 8th engagement agent.

Ingests newly-arrived prospect replies from the user's connected mailbox
(InboundMailProvider), de-dupes by provider message id, matches each to the
right Thread/Contact, records it as a `direction="them"` Message, classifies
intent via the AI chain, and applies a conservative action map.

Decisive + sticky: a HIGH-confidence "not interested" sets Contact.do_not_contact
(Step 04's suppression — every send path already honors it) and closes the
thread. Everything else is conservative: interested/meeting-ready advance the
stage + surface; question/OOO/other/low-confidence only surface. Never
auto-sends; never opts a contact out on a heuristic (no AI ⇒ ingest + surface,
no classification, no action)."""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.core.config import settings
from app.models import Campaign, Company, Contact, Message, Thread, User, utcnow
from app.providers.ai import ai
from app.providers.inbound import InboundMessage, inbound_provider
from app.services.events import add_notification

# Canonical intent labels the classifier may return.
INTENTS = {
    "interested",
    "meeting_ready",
    "not_interested",
    "question",
    "out_of_office",
    "other",
}

# Pure action labels (decide_action output) — verifiable without DB/AI.
ACTION_OPTOUT = "optout_close"   # not_interested + high conf → do_not_contact + Closed
ACTION_ADVANCE = "advance"       # interested/meeting_ready + high conf → Negotiating
ACTION_SURFACE = "surface"       # everything else → record + surface only

CLASSIFY_SYSTEM = (
    "You are a precise B2B sales reply classifier. Read the prospect's reply and "
    "return STRICT JSON only — no prose."
)


def decide_action(intent: str, confidence: int, min_confidence: int) -> str:
    """Pure mapping from (intent, confidence) → action label. Opt-out is the only
    destructive action and requires BOTH a not_interested label AND high
    confidence. OOO/question/other and any low-confidence reply only surface."""
    if intent == "not_interested" and confidence >= min_confidence:
        return ACTION_OPTOUT
    if intent in ("interested", "meeting_ready") and confidence >= min_confidence:
        return ACTION_ADVANCE
    return ACTION_SURFACE


def _normalize_subject(subject: str) -> str:
    """Lowercase + strip any leading run of re:/fwd:/fw: prefixes for matching."""
    s = (subject or "").strip().lower()
    while True:
        for p in ("re:", "fwd:", "fw:"):
            if s.startswith(p):
                s = s[len(p):].strip()
                break
        else:
            break
    return s


class ReplyClassifierAgent(Agent):
    key = "reply_classifier"
    name = "Reply Detection & Intent"

    # ---- classification ---------------------------------------------------
    def classify(self, body: str, subject: str = "") -> dict | None:
        """Label a prospect reply via the AI chain. Returns
        {"intent","confidence","reason"} or None when AI is unavailable/fails."""
        if not ai.available or not (body or "").strip():
            return None
        prompt = (
            "Classify this prospect email reply into exactly one intent.\n"
            "Intents:\n"
            "- interested: positive, wants to learn more\n"
            "- meeting_ready: explicitly wants to book/schedule a call or meeting\n"
            "- not_interested: declines, unsubscribe, 'remove me', 'no thanks', not a fit\n"
            "- question: asks a question but hasn't decided\n"
            "- out_of_office: an automatic away/vacation/OOO auto-reply\n"
            "- other: anything else\n\n"
            f"Subject: {subject}\n"
            f"Reply:\n{body}\n\n"
            'Return JSON only: {"intent": "<one>", "confidence": <0-100>, "reason": "<short>"}'
        )
        data = ai.complete_json(prompt, system=CLASSIFY_SYSTEM)
        if not isinstance(data, dict):
            return None
        intent = str(data.get("intent", "")).strip().lower()
        if intent not in INTENTS:
            intent = "other"
        try:
            confidence = int(data.get("confidence", 0))
        except (TypeError, ValueError):
            confidence = 0
        confidence = max(0, min(100, confidence))
        return {
            "intent": intent,
            "confidence": confidence,
            "reason": str(data.get("reason", ""))[:300],
        }

    # ---- thread matching --------------------------------------------------
    def _match_thread(
        self, db: Session, owner_id: int, msg: InboundMessage
    ) -> Thread | None:
        """Match an inbound reply to one of the user's threads. Priority:
        provider thread id → participant email (+ subject) → contact's most
        recent thread. Returns None (caller logs "unmatched") rather than
        guessing across unrelated contacts."""
        # 1) provider conversation id (best-effort — only if we ever stored one).
        if msg.thread_hint:
            t = (
                db.query(Thread)
                .join(Campaign, Campaign.id == Thread.campaign_id)
                .filter(
                    Campaign.owner_id == owner_id,
                    Thread.provider_thread_id == msg.thread_hint,
                )
                .first()
            )
            if t:
                return t

        # 2) by participant email → the contact's threads.
        if not msg.from_email:
            return None
        contact_ids = [
            cid
            for (cid,) in (
                db.query(Contact.id)
                .join(Company, Company.id == Contact.company_id)
                .join(Campaign, Campaign.id == Company.campaign_id)
                .filter(
                    Campaign.owner_id == owner_id,
                    func.lower(Contact.email) == msg.from_email.lower(),
                )
                .all()
            )
        ]
        if not contact_ids:
            return None
        threads = (
            db.query(Thread)
            .filter(Thread.contact_id.in_(contact_ids))
            .order_by(Thread.last_activity.desc())
            .all()
        )
        if not threads:
            return None
        target = _normalize_subject(msg.subject)
        if target:
            for t in threads:
                if _normalize_subject(t.subject) == target:
                    return t
        # 3) fall back to the contact's most recent thread.
        return threads[0]

    # ---- orchestration ----------------------------------------------------
    def run(self, db: Session, owner_id: int) -> dict:
        """Ingest + classify new inbound replies for one user. Returns
        {"ingested": int, "classified": int}. Never raises on provider errors."""
        owner = db.get(User, owner_id)
        if not owner or not inbound_provider.available_for(owner):
            return {"ingested": 0, "classified": 0}

        try:
            messages = inbound_provider.fetch_new_messages(owner)
        except Exception:
            self.log(db, owner_id, "Inbound fetch failed.", level="error")
            return {"ingested": 0, "classified": 0}

        ingested = 0
        classified = 0
        for m in messages:
            # Idempotent de-dupe — never double-insert the same provider message.
            if m.external_id and (
                db.query(Message)
                .filter(Message.external_id == m.external_id)
                .first()
            ):
                continue
            thread = self._match_thread(db, owner_id, m)
            if not thread:
                self.log(
                    db, owner_id,
                    f"Unmatched reply from {m.from_email or '?'} — skipped.",
                )
                continue

            msg = Message(
                thread_id=thread.id,
                direction="them",
                author=m.from_email or "Prospect",
                subject=m.subject,
                body=m.body,
                external_id=m.external_id,
                sent_at=m.sent_at or utcnow(),
            )
            db.add(msg)
            thread.unread = True
            thread.last_activity = utcnow()
            # A reply at minimum moves a still-"Contacted"/"Stalled" thread to
            # "Replied"; downstream actions may advance/close it further.
            if thread.stage in ("Contacted", "Stalled"):
                thread.stage = "Replied"
            db.commit()
            ingested += 1

            # Classification requires AI; without it the reply is still surfaced.
            verdict = self.classify(m.body, m.subject or "")
            if not verdict:
                self._notify_reply(db, owner_id, thread, None)
                continue
            msg.intent = verdict["intent"]
            action = decide_action(
                verdict["intent"], verdict["confidence"],
                settings.reply_optout_min_confidence,
            )
            self._apply(db, owner_id, thread, verdict, action)
            classified += 1

        if ingested:
            self.log(
                db, owner_id,
                f"Ingested {ingested} reply(ies); classified {classified}.",
            )
        return {"ingested": ingested, "classified": classified}

    # ---- actions ----------------------------------------------------------
    def _apply(
        self, db: Session, owner_id: int, thread: Thread, verdict: dict, action: str
    ) -> None:
        if action == ACTION_OPTOUT:
            contact = db.get(Contact, thread.contact_id) if thread.contact_id else None
            if contact:
                # The ENTIRE "stall their mail" action — every send path (outreach
                # draft, send, auto follow-up, meeting invite) already skips this.
                contact.do_not_contact = True
            thread.stage = "Closed"
            thread.last_activity = utcnow()
            db.commit()
            add_notification(
                db, owner_id, "reply", "Prospect opted out",
                f"'{thread.subject}' — classified not interested; contact removed "
                "from further outreach (do-not-contact + Closed).",
            )
            self.log(
                db, owner_id,
                f"Opt-out: {contact.email if contact else '?'} marked do-not-contact; thread Closed.",
            )
            return
        if action == ACTION_ADVANCE:
            thread.stage = "Negotiating"
            thread.last_activity = utcnow()
            db.commit()
            add_notification(
                db, owner_id, "reply", "Interested reply",
                f"'{thread.subject}' — {verdict['intent'].replace('_', ' ')}. "
                "Review and reply or book a meeting.",
            )
            return
        # ACTION_SURFACE — reply already recorded + thread unread; just notify.
        db.commit()
        self._notify_reply(db, owner_id, thread, verdict)

    def _notify_reply(
        self, db: Session, owner_id: int, thread: Thread, verdict: dict | None
    ) -> None:
        label = verdict["intent"].replace("_", " ") if verdict else "new reply"
        add_notification(
            db, owner_id, "reply", "New reply",
            f"'{thread.subject}' — {label}. Needs your attention.",
        )


reply_classifier_agent = ReplyClassifierAgent()
