import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reachly — AI B2B Outreach Platform",
  description:
    "AI-powered outreach & lead generation: research, score, discover contacts, verify emails, and automate personalized outreach end-to-end.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
