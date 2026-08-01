/**
 * First-run product tour: definition + per-user "seen" flag.
 *
 * The flag lives in localStorage keyed by user id (`synthsales_onboarded_<id>`),
 * so the tour shows once per account on this device and never again — unless the
 * user replays it from Settings, which clears the flag and returns to /dashboard
 * where the controller auto-starts it. (A device-local flag is deliberate and
 * sufficient for launch; a DB-backed flag would sync across devices — noted as a
 * possible follow-up.)
 */

export type TourStep = {
  id: string;
  /** `data-tour` value of the element to spotlight. */
  target: string;
  title: string;
  body: string;
  /** Preferred tooltip side; the tour flips it to stay on-screen. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Step whose target lives in the sidebar — on mobile the tour opens the nav
   *  sheet so the element is actually visible to spotlight. */
  sidebar?: boolean;
};

export const ONBOARDING_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: "dashboard",
    title: "Welcome to SynthSales",
    body: "This is your dashboard — your outreach funnel and reply outcomes at a glance. Here's the 60-second tour of how it works.",
    placement: "bottom",
  },
  {
    id: "campaigns",
    target: "nav-campaigns",
    sidebar: true,
    title: "1 · Create a campaign",
    body: "Start here. Name a campaign, describe your product and ideal customer, then upload a CSV of target companies.",
    placement: "right",
  },
  {
    id: "agents",
    target: "nav-agents",
    sidebar: true,
    title: "2 · Let the agents work",
    body: "The 8-agent pipeline researches and scores each company, then finds and verifies real decision-maker contacts — never fabricated ones. Watch and tune them here.",
    placement: "right",
  },
  {
    id: "conversations",
    target: "nav-conversations",
    sidebar: true,
    title: "3 · Handle replies",
    body: "Replies land here, classified by intent. Book a meeting in one click when a prospect is ready to talk.",
    placement: "right",
  },
  {
    id: "settings",
    target: "nav-settings",
    sidebar: true,
    title: "4 · Connect & go live",
    body: "Connect your email and calendar in Settings, then switch on sending when you're ready. Nothing reaches a real prospect until you say so.",
    placement: "right",
  },
];

const keyFor = (userId: number | string) => `synthsales_onboarded_${userId}`;

export function onboardingSeen(userId: number | string): boolean {
  if (typeof window === "undefined") return true; // never auto-run during SSR
  try {
    return window.localStorage.getItem(keyFor(userId)) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(userId: number | string): void {
  try {
    window.localStorage.setItem(keyFor(userId), "1");
  } catch {
    /* ignore (private mode / storage full) */
  }
}

export function resetOnboarding(userId: number | string): void {
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
