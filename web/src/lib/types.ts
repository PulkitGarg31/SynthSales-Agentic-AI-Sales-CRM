// Shared domain types for the AI-Powered B2B Outreach & Lead Generation platform.

export type CampaignStatus =
  | "Draft"
  | "Running"
  | "Paused"
  | "Completed"
  | "Failed";

export type CompanyStatus =
  | "Researching"
  | "Reviewed"
  | "Qualified"
  | "Approved"
  | "Excluded"
  | "Contacted";

export type MatchLevel = "Strong" | "Good" | "Moderate" | "Weak";

export type VerificationStatus = "Verified" | "Risky" | "Invalid" | "Unknown";

export type EmailState = "Queued" | "Sent" | "Delivered" | "Failed";

export type MeetingStatus = "Upcoming" | "Completed" | "Cancelled" | "No-show";

export type NotificationType =
  | "reply"
  | "meeting"
  | "verification"
  | "campaign"
  | "followup"
  | "error";

export interface Tone {
  label: string;
  value: string;
}

export interface Campaign {
  id: string;
  name: string;
  product: string;
  status: CampaignStatus;
  createdAt: string;
  companiesUploaded: number;
  companiesResearched: number;
  emailsSent: number;
  repliesReceived: number;
  meetingsBooked: number;
  topN: number;
  tone: string;
}

export interface ScoreFactor {
  label: string;
  weight: number; // 0-1
  score: number; // 0-100
}

export interface Company {
  id: string;
  campaignId: string;
  name: string;
  domain: string;
  industry: string;
  size: string;
  location: string;
  aiScore: number; // 0-100
  rank: number;
  matchLevel: MatchLevel;
  status: CompanyStatus;
  researchSummary: string;
  matchExplanation: string;
  scoreFactors: ScoreFactor[];
  recentFunding?: string;
  recentNews?: string;
  activeHiring: boolean;
  contactsFound: number;
  contactsVerified: number;
}

export interface Contact {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  role: string;
  email: string;
  linkedin?: string;
  verification: VerificationStatus;
  confidence: number; // 0-100
  approved: boolean | null; // null = pending
}

export interface EmailDraft {
  id: string;
  contactId: string;
  contactName: string;
  companyName: string;
  role: string;
  subject: string;
  body: string;
  footer: string;
  state: EmailState;
}

export interface ThreadMessage {
  id: string;
  from: "us" | "them";
  author: string;
  at: string;
  subject?: string;
  body: string;
  isFollowUp?: boolean;
}

export interface Conversation {
  id: string;
  campaignId: string;
  companyName: string;
  contactName: string;
  role: string;
  email: string;
  lastActivity: string;
  unread: boolean;
  stage: "Contacted" | "Replied" | "Negotiating" | "Meeting" | "Closed";
  messages: ThreadMessage[];
  aiSuggestion?: string;
}

export interface Meeting {
  id: string;
  company: string;
  contact: string;
  date: string; // ISO
  time: string;
  status: MeetingStatus;
  link: string;
  notes?: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string;
  at: string;
  read: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
  status: "Idle" | "Running" | "Error";
  lastRun: string;
}

export interface LogEntry {
  id: string;
  at: string;
  category: "Campaign" | "Email" | "AI" | "Verification" | "User";
  message: string;
  level: "info" | "warn" | "error";
}
