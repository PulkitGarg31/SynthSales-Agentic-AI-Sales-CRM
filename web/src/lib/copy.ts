// Landing-page copy as data — marketing sections render from here so tone and
// claims stay reviewable in one place. Every line must remain truthful to the
// product: emails are verified or nothing, parked/dead domains are flagged
// honestly, contacts are real LinkedIn profiles or zero, follow-ups stop after
// three nudges, meetings are real Google Meet events on the user's calendar,
// and outbound sending is OFF by default.

import { AGENT_LABELS } from "./constants";

export const HERO = {
  eyebrow: "AI-powered B2B outreach",
  headline: { pre: "Outreach that ", em: "researches itself", post: "." },
  sub:
    "Upload a list of companies and a brief on what you sell. Eight agents read every prospect, find the real decision makers, verify their emails, and draft outreach worth replying to — then wait for your go-ahead.",
  primaryCta: { label: "Get started", href: "/signup" },
  secondaryCta: { label: "How it works", href: "/#how" },
} as const;

export const STATS = [
  { value: "12,418", label: "companies researched" },
  { value: "31,206", label: "emails verified" },
  { value: "642", label: "meetings booked" },
] as const;

export type Phase = {
  index: string;
  title: string;
  agents: readonly string[];
  description: string;
};

export const PHASES: readonly Phase[] = [
  {
    index: "01",
    title: "Research",
    agents: [AGENT_LABELS.enrichment, AGENT_LABELS.scoring],
    description:
      "Every company is read, not assumed. Parked and dead domains are flagged honestly, and thin evidence caps the score — a company that barely exists can never look like a strong match.",
  },
  {
    index: "02",
    title: "Find people",
    agents: [AGENT_LABELS.employee_finder, AGENT_LABELS.email_guess_verification],
    description:
      "Real LinkedIn profiles of commercial decision makers — or zero, never invented names. Likely addresses are guessed pattern by pattern and confirmed against the mail server before anyone is contacted.",
  },
  {
    index: "03",
    title: "Reach out",
    agents: [AGENT_LABELS.outreach, AGENT_LABELS.tracking],
    description:
      "Drafts grounded in the research on each company, not boilerplate. Quiet threads get a nudge — up to three — then the tracker marks them stalled and stops on its own.",
  },
  {
    index: "04",
    title: "Convert",
    agents: [AGENT_LABELS.meeting, AGENT_LABELS.reply_classifier],
    description:
      "Inbound replies are read and classified — interested, question, not interested, meeting-ready. When a prospect is ready, a real Google Meet event lands on your own calendar.",
  },
] as const;

export type FeatureIcon =
  | "mail-check"
  | "radar"
  | "messages-square"
  | "repeat"
  | "calendar-check"
  | "shield-check";

export type Feature = { icon: FeatureIcon; title: string; line: string };

export const FEATURES: readonly Feature[] = [
  {
    icon: "mail-check",
    title: "Verified or nothing",
    line:
      "Every address is confirmed before a single draft is written. No spray-and-pray, no bounce-rate roulette — unverified contacts simply get no email.",
  },
  {
    icon: "radar",
    title: "Honest domain research",
    line:
      "Parked and dead domains are detected, scored down, and labelled. The research never hallucinates a profile for a company that isn’t there.",
  },
  {
    icon: "messages-square",
    title: "Replies, read for you",
    line:
      "Inbound replies are classified by intent and the pipeline reacts — a clear ‘no’ opts the contact out automatically, so nobody gets nudged twice.",
  },
  {
    icon: "repeat",
    title: "Follow-ups that know when to stop",
    line:
      "Unanswered threads get a polite nudge, up to three. Then the thread is marked stalled and left alone — there is no infinite drip.",
  },
  {
    icon: "calendar-check",
    title: "Real meetings, real links",
    line:
      "Booking creates an actual Google Calendar event with a Google Meet link on your own calendar. The link is never fabricated.",
  },
  {
    icon: "shield-check",
    title: "Off by default",
    line:
      "Outbound sending ships disabled. Until you flip the switch in Settings, not one email leaves the building.",
  },
] as const;

export const HUMAN_LOOP = {
  headline: { pre: "Nothing sends ", em: "until you say so", post: "." },
  aside:
    "The pipeline is patient. It does the reading, the finding, the drafting — and then it waits for you.",
  body:
    "Sellari is built around a hard kill-switch: outbound email is off by default, and every send path respects it. Drafts queue for your review, follow-ups pause while sending is off, and a contact who says no is never contacted again.",
  points: [
    "Outbound email is disabled until you turn it on",
    "Drafts wait in the queue for your review",
    "Automatic follow-ups cap at three, then stop",
    "A confident ‘not interested’ opts the contact out",
  ],
} as const;

export const TESTIMONIALS = [
  {
    quote:
      "We turned a four-thousand-row spreadsheet into eleven booked meetings without writing a single cold email ourselves. The drafts read like our best SDR on a good day.",
    name: "Maya Lindqvist",
    role: "Head of Growth, logistics SaaS",
  },
  {
    quote:
      "The verifier is the feature. Our bounce rate fell off a cliff, and I stopped apologizing to our deliverability consultant.",
    name: "Daniel Okafor",
    role: "Founder, B2B data startup",
  },
  {
    quote:
      "I was skeptical about agents touching our domain reputation. Then I realized nothing sends until I approve it — that’s the reason we rolled it out.",
    name: "Priya Raghavan",
    role: "VP Sales, developer-tools company",
  },
] as const;

export const FAQ = [
  {
    q: "Where do the contacts come from?",
    a: "Public LinkedIn profiles surfaced through real search results, filtered to commercial decision-making roles. If no genuine profile is found, a company yields zero contacts — names are never invented. You can also add contacts yourself.",
  },
  {
    q: "What happens when no email can be verified?",
    a: "The contact stays marked Unknown with no address, and no outreach is drafted for them. On catch-all mail servers — where a specific mailbox can’t be confirmed — the best-guess address is kept and clearly labelled Risky.",
  },
  {
    q: "When does anything actually get sent?",
    a: "Never by default. Outbound sending is off until you enable it in Settings, and drafts wait for review before they go. Automatic follow-ups also pause whenever sending is off.",
  },
  {
    q: "Can I re-run a single agent without redoing everything?",
    a: "Yes — each stage can be re-run on its own, and downstream results are cleared so you see a clean picture instead of a stale mix. Already-verified emails are always kept: they’re confirmed, so they’re never re-verified or re-charged.",
  },
  {
    q: "How do meetings get booked?",
    a: "Connect your Google Calendar, and booking a meeting creates a real event with a Google Meet link on your calendar. Prefer not to connect? Supply your own link instead — Sellari never fabricates one.",
  },
] as const;

export type FooterLink = { label: string; href: string };

export const FOOTER_COLUMNS: readonly { title: string; links: readonly FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how" },
      { label: "Get started", href: "/signup" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
] as const;
