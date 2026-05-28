"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str


class VerifyOtpIn(BaseModel):
    email: EmailStr
    code: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORMModel):
    id: int
    name: str
    email: EmailStr
    is_verified: bool
    outbound_enabled: bool = False
    created_at: datetime


class UserUpdate(BaseModel):
    outbound_enabled: bool | None = None


class RegisterOut(UserOut):
    # In development, when email isn't actually delivered, surface the OTP so
    # the user can still verify. Always null in production / when email is sent.
    dev_otp: str | None = None
    email_sent: bool = False


# ---------- Campaign ----------
class CampaignBase(BaseModel):
    name: str
    product: str = ""
    tone: str = "professional"
    top_n: int = 50
    product_description: str = ""
    value_proposition: str = ""
    industry: str = ""
    differentiators: str = ""
    icp: str = ""
    industry_pref: str = ""
    geography: str = ""
    company_size: str = ""
    business_requirements: str = ""
    ranking_criteria: str = ""
    email_template: str = ""
    footer: str = ""
    personalization_level: int = 2


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: str | None = None
    product: str | None = None
    status: str | None = None
    tone: str | None = None
    top_n: int | None = None
    email_template: str | None = None
    footer: str | None = None
    personalization_level: int | None = None


class CampaignOut(ORMModel):
    id: int
    name: str
    product: str
    status: str
    tone: str
    top_n: int
    created_at: datetime
    # rollups
    companies_uploaded: int = 0
    companies_researched: int = 0
    emails_sent: int = 0
    replies_received: int = 0
    meetings_booked: int = 0


class PipelineAgentOut(BaseModel):
    key: str
    name: str
    description: str
    order: int
    status: str        # Idle | Running | Error  (from AgentConfig — per-user)
    enabled: bool      # whether the agent is enabled at all (per-user toggle)
    last_run: datetime | None = None
    total: int = 0     # work items applicable to this campaign (e.g. companies)
    completed: int = 0 # how many of those are done
    runnable: bool = True  # False for "meeting" (no on-demand run)


# ---------- Company / Contact ----------
class ScoreFactor(BaseModel):
    label: str
    weight: float
    score: int


class ContactOut(ORMModel):
    id: int
    company_id: int
    name: str
    role: str
    email: str
    linkedin: str | None = None
    verification: str
    confidence: int
    approved: bool | None = None


class ContactUpdate(BaseModel):
    email: str | None = None
    approved: bool | None = None
    role: str | None = None
    name: str | None = None


class CompanyOut(ORMModel):
    id: int
    campaign_id: int
    name: str
    domain: str
    industry: str
    size: str
    location: str
    ai_score: int
    rank: int
    match_level: str
    status: str
    research_summary: str
    match_explanation: str
    score_factors: list = []
    recent_funding: str | None = None
    recent_news: str | None = None
    active_hiring: bool
    enrichment_confidence: int = 50
    domain_status: str = "unknown"
    contacts_found: int = 0
    contacts_verified: int = 0


class CompanyDetailOut(CompanyOut):
    contacts: list[ContactOut] = []


class CompanyStatusUpdate(BaseModel):
    status: str  # Approved | Excluded | ...


# ---------- Email drafts ----------
class EmailDraftOut(ORMModel):
    id: int
    contact_id: int
    subject: str
    body: str
    footer: str
    state: str


class EmailDraftUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    footer: str | None = None
    state: str | None = None


# ---------- Threads / messages ----------
class MessageOut(ORMModel):
    id: int
    direction: str
    author: str
    subject: str | None = None
    body: str
    is_follow_up: bool
    sent_at: datetime


class ThreadOut(ORMModel):
    id: int
    campaign_id: int
    company_id: int | None = None
    contact_id: int | None = None
    subject: str
    stage: str
    unread: bool
    last_activity: datetime
    company_name: str = ""
    contact_name: str = ""
    role: str = ""
    email: str = ""


class ThreadDetailOut(ThreadOut):
    messages: list[MessageOut] = []
    ai_suggestion: str | None = None


class ReplyIn(BaseModel):
    body: str


# ---------- Meetings ----------
class MeetingOut(ORMModel):
    id: int
    campaign_id: int | None = None
    company: str
    contact: str
    scheduled_at: datetime
    status: str
    link: str
    notes: str | None = None


# ---------- Notifications ----------
class NotificationOut(ORMModel):
    id: int
    type: str
    title: str
    detail: str
    read: bool
    created_at: datetime


# ---------- Logs ----------
class LogOut(ORMModel):
    id: int
    category: str
    level: str
    message: str
    created_at: datetime


# ---------- Agents ----------
class AgentOut(ORMModel):
    id: int
    key: str
    name: str
    description: str
    enabled: bool
    order: int
    status: str
    last_run: datetime | None = None


class AgentUpdate(BaseModel):
    enabled: bool


# ---------- Dashboard ----------
class FunnelStage(BaseModel):
    label: str
    value: int


class DashboardOut(BaseModel):
    active_campaigns: int
    paused_campaigns: int
    completed_campaigns: int
    companies_uploaded: int
    companies_researched: int
    emails_sent: int
    replies_received: int
    meetings_booked: int
    funnel: list[FunnelStage]
