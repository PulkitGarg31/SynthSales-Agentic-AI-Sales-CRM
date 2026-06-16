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
  title: { default: "SynthSales · outreach that researches itself", template: "%s · SynthSales" },
  description:
    "Eight AI agents research companies, find decision makers, verify emails, draft outreach, and book the meeting. You approve every send.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

// Runs before anything paints (parser-blocking, first in <body>): saved choice
// wins, otherwise the OS preference. Keeps a dark-mode user from getting a
// cream flash on every load.
const themeBoot = `(function(){try{var t=localStorage.getItem("sellari_theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* Font variable classes must stay on <html> (:root) - globals.css resolves
       var(--font-schibsted) etc. at :root; moving them to <body> breaks all three.
       suppressHydrationWarning: the boot script adds .dark outside React. */
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {children}
      </body>
    </html>
  );
}
