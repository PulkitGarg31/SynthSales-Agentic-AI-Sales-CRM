from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.core.config import settings
from app.models import Campaign, Contact, Meeting, Message, Thread, User, utcnow
from app.providers.calendar import calendar_provider
from app.providers.email import email_provider
from app.services.events import add_notification


class MeetingAgent(Agent):
    key = "meeting"
    name = "Meeting Coordination"

    def book(
        self,
        db: Session,
        thread: Thread,
        owner: User,
        scheduled_at: datetime,
        link: str | None = None,
        notes: str | None = None,
        duration_minutes: int | None = None,
        notify: bool = True,
    ) -> Meeting:
        contact = db.get(Contact, thread.contact_id) if thread.contact_id else None
        campaign = db.get(Campaign, thread.campaign_id)
        company_name = (
            contact.company.name if contact and contact.company else thread.subject
        )
        contact_name = contact.name if contact else "—"
        duration = duration_minutes or settings.meeting_default_duration_minutes
        end_at = scheduled_at + timedelta(minutes=duration)

        # Resolve the meeting link. Priority: a link the user pasted, else a real
        # Google Meet link created on the user's OWN calendar. The link itself is
        # generated regardless of the kill-switch; only the prospect invite/email
        # is gated on outbound_enabled. Never fabricate a fake link.
        meet_link = (link or "").strip()
        invite_sent = False
        if not meet_link and calendar_provider.available_for(owner):
            want_invite = bool(
                notify
                and owner.outbound_enabled
                and contact
                and contact.email
                and not contact.do_not_contact
            )
            result = calendar_provider.create_meet_event(
                owner,
                summary=f"{(campaign.product if campaign else '') or 'Intro'} — {company_name}",
                description=notes or "Booked via SynthSales.",
                start=scheduled_at,
                end=end_at,
                attendee_email=contact.email if contact else None,
                send_invite=want_invite,
            )
            if result and result.get("link"):
                meet_link = result["link"]
                invite_sent = want_invite
        if not meet_link:
            # No paste and no connected calendar → cannot honestly produce a link.
            raise ValueError("no_meeting_link")

        # Double-booking guard: one Upcoming meeting per thread's company+contact.
        meeting = (
            db.query(Meeting)
            .filter(
                Meeting.campaign_id == thread.campaign_id,
                Meeting.company == company_name,
                Meeting.contact == contact_name,
                Meeting.status == "Upcoming",
            )
            .first()
        )
        if meeting:
            meeting.scheduled_at = scheduled_at
            meeting.link = meet_link
            meeting.notes = notes
        else:
            meeting = Meeting(
                campaign_id=thread.campaign_id,
                company=company_name,
                contact=contact_name,
                scheduled_at=scheduled_at,
                status="Upcoming",
                link=meet_link,
                notes=notes,
            )
            db.add(meeting)

        confirm = (
            f"Great — booked for {scheduled_at:%b %d, %Y %I:%M %p} UTC. "
            f"Join link: {meet_link}"
        )
        db.add(
            Message(
                thread_id=thread.id,
                direction="us",
                author="SynthSales",
                body=confirm,
                is_follow_up=True,
            )
        )
        thread.stage = "Meeting"
        thread.last_activity = utcnow()
        db.commit()
        db.refresh(meeting)

        add_notification(
            db,
            owner.id,
            "meeting",
            "Meeting scheduled",
            f"{company_name} — {scheduled_at:%b %d, %Y %I:%M %p} UTC.",
        )
        # Email the contact ourselves only if a real calendar invite was NOT sent
        # (avoid double-emailing), sending is on, we have an address, and the
        # contact isn't suppressed.
        if (
            notify
            and not invite_sent
            and owner.outbound_enabled
            and contact
            and contact.email
            and not contact.do_not_contact
        ):
            email_provider.send(
                contact.email,
                f"Meeting confirmed — {campaign.product if campaign else ''}",
                confirm,
            )
        self.log(db, owner.id, f"Booked meeting with {company_name}.")
        return meeting


meeting_agent = MeetingAgent()
