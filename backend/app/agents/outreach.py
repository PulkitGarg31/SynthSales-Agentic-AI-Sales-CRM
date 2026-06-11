from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Campaign, Company, Contact, EmailDraft
from app.providers.ai import ai


class OutreachAgent(Agent):
    key = "outreach"
    name = "Outreach Generation"

    def run(
        self,
        db: Session,
        contact: Contact,
        company: Company,
        campaign: Campaign,
        owner_id: int,
        force: bool = False,
    ) -> EmailDraft:
        existing = (
            db.query(EmailDraft).filter(EmailDraft.contact_id == contact.id).first()
        )
        if existing and not force:
            return existing
        if existing and force:
            db.delete(existing)
            db.commit()

        subject, body = self._generate(contact, company, campaign)
        footer = campaign.footer or "Best regards,\nThe Sellari Team"
        draft = EmailDraft(
            contact_id=contact.id,
            subject=subject,
            body=body,
            footer=footer,
            state="Queued",
        )
        db.add(draft)
        db.commit()
        db.refresh(draft)
        self.log(db, owner_id, f"Drafted outreach to {contact.name} ({company.name}).")
        return draft

    def _generate(self, contact: Contact, company: Company, campaign: Campaign) -> tuple[str, str]:
        if ai.available:
            prompt = (
                f"Write a short, personalized cold outreach email.\n"
                f"Recipient: {contact.name}, {contact.role} at {company.name}.\n"
                f"Company research: {company.research_summary}\n"
                f"We sell: {campaign.product} — {campaign.value_proposition or campaign.product_description}\n"
                f"Tone: {campaign.tone}. Personalization level: {campaign.personalization_level}/3.\n"
                f"{'Use this template: ' + campaign.email_template if campaign.email_template else ''}\n"
                "Return JSON with keys: subject (string) and body (string, no signature)."
            )
            data = ai.complete_json(prompt, system="You are an expert B2B SDR copywriter.")
            if data and data.get("subject") and data.get("body"):
                return data["subject"], data["body"]

        # Deterministic fallback template.
        first = contact.name.split(" ")[0]
        subject = f"{campaign.product or 'A quick idea'} for {company.name}"
        body = (
            f"Hi {first},\n\n"
            f"I came across {company.name} while researching leaders in {company.industry}. "
            f"{company.research_summary.split('.')[0]}.\n\n"
            f"We help teams like yours with {campaign.product or 'our solution'} — "
            f"{campaign.value_proposition or campaign.product_description or 'measurable results, fast'}.\n\n"
            f"Would a brief 20-minute call next week be worth your time, {first}?"
        )
        return subject, body


outreach_agent = OutreachAgent()
