import { Wordmark } from "@/components/brand/Wordmark";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <Wordmark withEmblem size="lg" />
      <h1 className="display text-5xl">
        Outreach that <em>researches itself</em>.
      </h1>
      <Eyebrow index="01">Design system online</Eyebrow>
    </main>
  );
}
