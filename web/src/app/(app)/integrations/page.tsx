import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

const groups = [
  {
    title: "Email providers",
    items: [
      { name: "Gmail / Google Workspace", desc: "Send & monitor replies via Gmail API.", connected: true },
      { name: "Outlook / Microsoft 365", desc: "Send outreach from your Outlook mailbox.", connected: false },
      { name: "Custom SMTP", desc: "Bring your own SMTP server.", connected: false },
    ],
  },
  {
    title: "Calendar & meetings",
    items: [
      { name: "Google Calendar", desc: "Auto-create events when meetings are booked.", connected: true },
      { name: "Google Meet", desc: "Generate join links for scheduled meetings.", connected: true },
      { name: "Zoom", desc: "Create Zoom links for meetings.", connected: false },
    ],
  },
  {
    title: "Verification & data",
    items: [
      { name: "Verifalia", desc: "Email verification (Verified / Risky / Invalid).", connected: true },
      { name: "DuckDuckGo Search", desc: "Company research & enrichment source.", connected: true },
    ],
  },
  {
    title: "CRM & automation",
    items: [
      { name: "CRM Export (CSV / HubSpot)", desc: "Export qualified leads & threads.", connected: false },
      { name: "Webhooks", desc: "Push events to your own endpoints.", connected: false },
    ],
  },
];

export default function IntegrationsPage() {
  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect email, calendar, verification, and CRM tools."
      />
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.title}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
              {g.title}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => (
                <Card key={it.name} className="flex flex-col p-5">
                  <div className="flex items-start justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/25 text-ink">
                      <Icon.Plug width={18} height={18} />
                    </span>
                    {it.connected ? (
                      <Badge tone="ok">
                        <Icon.Check width={12} height={12} /> Connected
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Not connected</Badge>
                    )}
                  </div>
                  <h3 className="mt-3 font-bold text-ink">{it.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-ink-500">{it.desc}</p>
                  <Button
                    variant={it.connected ? "ghost" : "primary"}
                    className="mt-4 w-full text-sm"
                  >
                    {it.connected ? "Manage" : "Connect"}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
