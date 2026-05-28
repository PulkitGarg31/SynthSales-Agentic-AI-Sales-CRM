from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Campaign, Contact, Meeting, Message, Thread, User, utcnow
from app.providers.email import email_provider
from app.services.events import add_notification


class MeetingAgent(Agent):
    key = "meeting"
    name = "Meeting Coordination"

    def book(
        self,
        db: Session,
        thread: Thread,
        owner_id: int,
        scheduled_at: datetime,
        link: str,
        notes: str | None = None,
    ) -> Meeting:
        contact = db.get(Contact, thread.contact_id) if thread.contact_id else None
        campaign = db.get(Campaign, thread.campaign_id)
        company_name = (
            contact.company.name if contact and contact.company else thread.subject
        )

        meeting = Meeting(
            campaign_id=thread.campaign_id,
            company=company_name,
            contact=contact.name if contact else "—",
            scheduled_at=scheduled_at,
            status="Upcoming",
            link=link,
            notes=notes,
        )
        db.add(meeting)

        # Confirmation message + stage change.
        confirm = (
            f"Great — booked for {scheduled_at:%b %d, %Y %I:%M %p}. "
            f"Calendar invite + join link sent: {link}"
        )
        db.add(
            Message(
                thread_id=thread.id,
                direction="us",
                author="Reachly",
                body=confirm,
                is_follow_up=True,
            )
        )
        thread.stage = "Meeting"
        thread.last_activity = utcnow()
        db.commit()
        db.refresh(meeting)

        # Notify customer (in-app) and the contact (email).
        add_notification(
            db,
            owner_id,
            "meeting",
            "Meeting scheduled",
            f"{company_name} — {scheduled_at:%b %d, %Y %I:%M %p}.",
        )
        owner = db.get(User, owner_id)
        if contact and contact.email and owner and owner.outbound_enabled:
            email_provider.send(contact.email, f"Meeting confirmed — {campaign.product if campaign else ''}", confirm)
        self.log(db, owner_id, f"Booked meeting with {company_name}.")
        return meeting


meeting_agent = MeetingAgent()
