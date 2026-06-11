// Canonical status→tone and label mappings shared across the Sellari UI.
// `Tone` keys match the Badge component's tone variants.

export type Tone = "moss" | "amber" | "rust" | "ink" | "faint" | "terracotta";

export const VERIFICATION_TONE: Record<string, Tone> = {
  Verified: "moss",
  Risky: "amber",
  Unknown: "faint",
  Invalid: "rust",
};

export const DOMAIN_TONE: Record<string, Tone> = {
  live: "moss",
  parked: "amber",
  dead: "rust",
  unknown: "faint",
};

export const MATCH_TONE: Record<string, Tone> = {
  Strong: "moss",
  Good: "ink",
  Moderate: "amber",
  Weak: "rust",
};

export const CAMPAIGN_TONE: Record<string, Tone> = {
  Draft: "faint",
  Running: "moss",
  Paused: "amber",
  Completed: "ink",
};

export const STAGE_TONE: Record<string, Tone> = {
  Contacted: "faint",
  Replied: "moss",
  Negotiating: "amber",
  Meeting: "terracotta",
  Closed: "ink",
  Stalled: "rust",
};

export const INTENT_TONE: Record<string, Tone> = {
  interested: "moss",
  meeting_ready: "terracotta",
  not_interested: "rust",
  question: "amber",
  out_of_office: "faint",
  other: "faint",
};

export const DRAFT_TONE: Record<string, Tone> = {
  Queued: "faint",
  Sent: "moss",
};

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
