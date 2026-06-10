import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Instrument_Serif, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });
const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "Sellari AI — outreach that researches itself", template: "%s · Sellari AI" },
  description:
    "Eight AI agents research companies, find decision makers, verify emails, draft outreach, and book the meeting — you approve every send.",
};

export const viewport: Viewport = { themeColor: "#f4efe6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* Font variable classes must stay on <html> (:root) — globals.css resolves
       var(--font-schibsted) etc. at :root; moving them to <body> breaks all three. */
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
