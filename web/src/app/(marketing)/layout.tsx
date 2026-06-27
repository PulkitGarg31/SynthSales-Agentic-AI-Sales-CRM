import { BackendWarmup } from "@/components/BackendWarmup";
import { MarketingTopbar } from "@/components/marketing/MarketingTopbar";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <BackendWarmup />
      <MarketingTopbar />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}