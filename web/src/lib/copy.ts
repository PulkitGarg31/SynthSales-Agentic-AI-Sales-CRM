// Landing-page copy as data - marketing sections render from here so tone and
// claims stay reviewable in one place. Every PRODUCT-BEHAVIOR claim must remain
// truthful: emails are verified (or clearly labeled Risky on catch-all servers),
// parked/dead domains are flagged honestly, contacts are real LinkedIn profiles
// or zero, follow-ups stop after three nudges, meetings are real Google Meet
// events on the user's calendar, and outbound sending is OFF by default.
// (STATS and TESTIMONIALS are illustrative marketing set-dressing, not data.)

import { AGENT_LABELS } from "./constants";

export const HERO = {
  eyebrow: "Introducing SynthSales",
  headline: { pre: "Outreach that ", em: "researches itself", post: "." },
  sub:
    "Struggling with sales? The fix is just one click away. SynthSales studies your market, finds the people who can actually say yes, and reaches out with emails that feel hand-written. All that's left for you is the meeting.",
  primaryCta: { label: "Get started", href: "/signup" },
  secondaryCta: { label: "How it works", href: "/#how" },
} as const;

export const STATS = [
  { value: "6,142", label: "companies researched" },
  { value: "15,659", label: "emails verified" },
  { value: "306", label: "meetings booked" },
] as const;

export type Phase = {
  index: string;
  title: string;
  agents: readonly string[];
  points: readonly string[];
};

export const PHASES: readonly Phase[] = [
  {
    index: "01",
    title: "Research",
    agents: [AGENT_LABELS.enrichment, AGENT_LABELS.scoring],
    points: [
      "Reads each company like an analyst — site, signals, news, hiring",
      "Weak evidence sinks the score; dead domains are flagged on sight",
      "Only real, reachable businesses rise to the top of your list",
    ],
  },
  {
    index: "02",
    title: "Find people",
    agents: [AGENT_LABELS.employee_finder, AGENT_LABELS.email_guess_verification],
    points: [
      "Real LinkedIn decision-makers, or none at all — names are never invented",
      "Addresses guessed pattern by pattern, then confirmed against the mail server",
      "Nobody is contacted until the mailbox checks out, so bounces stay rare",
    ],
  },
  {
    index: "03",
    title: "Reach out",
    agents: [AGENT_LABELS.outreach, AGENT_LABELS.tracking],
    points: [
      "No templates — each draft is built from that company's own research",
      "Reads like you actually did the homework",
      "Up to three gentle follow-ups, then it knows when to stop",
    ],
  },
  {
    index: "04",
    title: "Convert",
    agents: [AGENT_LABELS.meeting, AGENT_LABELS.reply_classifier],
    points: [
      "Every reply read and classified on arrival: interested, question, not interested, meeting-ready",
      "A yes books a real Google Meet event on your own calendar",
      "The deal moves to the meeting stage automatically",
    ],
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
      "Before a draft is written, every address is verified as a real, deliverable mailbox. If it can't be confirmed it's marked Risky or skipped. Guesswork never reaches an inbox.",
  },
  {
    icon: "radar",
    title: "Honest domain research",
    line:
      "A parked domain can't buy anything. Dead and abandoned sites are spotted early, scored down, and labeled honestly instead of dressed up as leads.",
  },
  {
    icon: "messages-square",
    title: "Replies, read for you",
    line:
      "Every reply is read and sorted by what it means. A clear 'no' opts the contact out on the spot, an interested one rises to the top of your inbox, and nobody ever gets nudged twice.",
  },
  {
    icon: "repeat",
    title: "Follow-ups that know when to stop",
    line:
      "Silence gets a polite nudge, then another, three at most. After that the thread is marked stalled and set aside for good. Persistence, never pestering.",
  },
  {
    icon: "calendar-check",
    title: "Real meetings, real links",
    line:
      "One click books a real Google Calendar event with a Meet link on your calendar. No fake links, no scheduling dance.",
  },
  {
    icon: "shield-check",
    title: "Off by default",
    line:
      "Out of the box, sending is off. Draft, review and test as much as you like; not one email reaches a prospect until you flip the switch yourself.",
  },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      "We turned a five-hundred-row spreadsheet into eleven booked meetings without writing a single cold email ourselves. The drafts read like our best SDR on a good day.",
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
      "I was skeptical about agents touching our domain reputation. Then I realized nothing sends until I approve it. That’s the reason we rolled it out.",
    name: "Priya Raghavan",
    role: "VP Sales, developer-tools company",
  },
] as const;

export const FAQ = [
  {
    q: "Where do the contacts come from?",
    a: "Real LinkedIn profiles found through live search, filtered to decision makers. No profile found means zero contacts; names are never invented.",
  },
  {
    q: "What happens when no email can be verified?",
    a: "The contact stays Unknown with no address and gets no outreach. On catch-all servers the best guess is kept, clearly labeled Risky.",
  },
  {
    q: "When does anything actually get sent?",
    a: "Never by default. Sending stays off until you enable it in Settings, and drafts wait for your review first.",
  },
  {
    q: "Can I re-run a single agent without redoing everything?",
    a: "Yes. Any stage can be re-run on its own; downstream results are cleared for a clean picture, and verified emails are always kept.",
  },
  {
    q: "How do meetings get booked?",
    a: "Connect Google Calendar and every booking creates a real event with a Meet link. No calendar? Paste your own link; SynthSales never fabricates one.",
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
      { label: "Documentation", href: "/docs" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
] as const;
