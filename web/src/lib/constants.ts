// Canonical status→tone and label mappings shared across the SynthSales UI.
// `Tone` keys match the Badge component's tone variants.
// Maps are declared `Record<string, Tone>` so admin views can index with plain
// strings, while `satisfies` keeps each map exhaustive over its backend union.

import type {
  CampaignStatus,
  CompanyStatus,
  EmailState,
  Intent,
  MatchLevel,
  ThreadStage,
  VerificationStatus,
} from "./api-types";

export type Tone = "moss" | "amber" | "rust" | "ink" | "faint" | "terracotta";

export const VERIFICATION_TONE: Record<string, Tone> = {
  Verified: "moss",
  Risky: "amber",
  Unknown: "faint",
  Invalid: "rust",
} satisfies Record<VerificationStatus, Tone>;

export const DOMAIN_TONE: Record<string, Tone> = {
  live: "moss",
  parked: "amber",
  dead: "rust",
  unknown: "faint",
} satisfies Record<"live" | "parked" | "dead" | "unknown", Tone>;

export const MATCH_TONE: Record<string, Tone> = {
  Strong: "moss",
  Good: "ink",
  Moderate: "amber",
  Weak: "rust",
} satisfies Record<MatchLevel, Tone>;

export const COMPANY_TONE: Record<string, Tone> = {
  Researching: "faint",
  Reviewed: "ink",
  Qualified: "moss",
  Approved: "terracotta",
  Excluded: "rust",
  Contacted: "moss",
} satisfies Record<CompanyStatus, Tone>;

export const CAMPAIGN_TONE: Record<string, Tone> = {
  Draft: "faint",
  Running: "moss",
  Paused: "amber",
  Completed: "ink",
  Failed: "rust",
} satisfies Record<CampaignStatus, Tone>;

export const STAGE_TONE: Record<string, Tone> = {
  Contacted: "faint",
  Replied: "moss",
  Negotiating: "amber",
  Meeting: "terracotta",
  Closed: "ink",
  Stalled: "rust",
} satisfies Record<ThreadStage, Tone>;

export const INTENT_TONE: Record<string, Tone> = {
  interested: "moss",
  meeting_ready: "terracotta",
  not_interested: "rust",
  question: "amber",
  out_of_office: "faint",
  other: "faint",
} satisfies Record<Intent, Tone>;

export const DRAFT_TONE: Record<string, Tone> = {
  Queued: "faint",
  Sent: "moss",
  Delivered: "moss",
  Failed: "rust",
} satisfies Record<EmailState, Tone>;

export const AGENT_STATUS_TONE: Record<string, Tone> = {
  Idle: "faint",
  Running: "terracotta",
  Error: "rust",
};

/** Friendly UI labels keyed by backend agent key; fall back to backend name. */
export const AGENT_LABELS: Record<string, string> = {
  enrichment: "Research",
  scoring: "Scoring & ranking",
  employee_finder: "People finder",
  email_guess_verification: "Email verifier",
  outreach: "Outreach writer",
  tracking: "Follow-up tracker",
  meeting: "Meeting scheduler",
  reply_classifier: "Reply reader",
};

export const THREAD_STAGES = [
  "Contacted",
  "Replied",
  "Negotiating",
  "Meeting",
  "Closed",
  "Stalled",
] as const;

export const LOG_CATEGORIES = [
  "All",
  "Campaign",
  "Email",
  "AI",
  "Verification",
  "User",
] as const;
