import { Badge, Button, Card, CardHeader, PageHeader, Progress } from "@/components/ui";
import { Icon } from "@/components/icons";

const usage = [
  { label: "Email credits", used: 561, total: 2000 },
  { label: "Companies researched", used: 1118, total: 5000 },
  { label: "Email verifications", used: 642, total: 3000 },
  { label: "Active campaigns", used: 2, total: 10 },
];

const plans = [
  { name: "Starter", price: "$0", tagline: "For trying things out", features: ["500 email credits", "1 campaign", "Basic agents"], current: false },
  { name: "Growth", price: "$99", tagline: "For active outbound teams", features: ["2,000 email credits", "10 campaigns", "All 8 agents", "Verifalia verification"], current: true },
  { name: "Scale", price: "$299", tagline: "For high-volume outreach", features: ["10,000 email credits", "Unlimited campaigns", "Priority support", "API & webhooks"], current: false },
];

const payments = [
  { date: "2026-05-01", amount: "$99.00", status: "Paid" },
  { date: "2026-04-01", amount: "$99.00", status: "Paid" },
  { date: "2026-03-01", amount: "$99.00", status: "Paid" },
];

export default function BillingPage() {
  return (
    <div>
      <PageHeader
        title="Billing & Subscription"
        subtitle="Manage your plan, usage, and payment history."
      />

      {/* Usage */}
      <Card className="mb-6">
        <CardHeader
          title="Current usage"
          subtitle="Billing period: May 2026"
          action={<Badge tone="brand">Growth plan</Badge>}
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {usage.map((u) => (
            <div key={u.label}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold text-ink">{u.label}</span>
                <span className="text-ink-500">
                  {u.used.toLocaleString()} / {u.total.toLocaleString()}
                </span>
              </div>
              <Progress value={(u.used / u.total) * 100} />
            </div>
          ))}
        </div>
      </Card>

      {/* Plans */}
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
        Plans
      </h2>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <Card
            key={p.name}
            className={`flex flex-col p-5 ${
              p.current ? "ring-2 ring-brand" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl text-ink">{p.name}</h3>
              {p.current && <Badge tone="ok">Current</Badge>}
            </div>
            <p className="text-sm text-ink-500">{p.tagline}</p>
            <p className="mt-3 font-display text-4xl text-ink">
              {p.price}
              <span className="text-base font-normal text-ink-300">/mo</span>
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-700">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Icon.Check width={15} height={15} className="text-ok" /> {f}
                </li>
              ))}
            </ul>
            <Button
              variant={p.current ? "ghost" : "primary"}
              className="mt-5 w-full"
              disabled={p.current}
            >
              {p.current ? "Your plan" : "Upgrade"}
            </Button>
          </Card>
        ))}
      </div>

      {/* Payment history */}
      <Card className="overflow-hidden p-0">
        <CardHeader title="Payment history" />
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-peach-soft/60 text-xs uppercase text-ink-500">
            <tr>
              <th className="px-5 py-3 font-bold">Date</th>
              <th className="px-5 py-3 font-bold">Amount</th>
              <th className="px-5 py-3 font-bold">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {payments.map((pm) => (
              <tr key={pm.date}>
                <td className="px-5 py-3 text-ink-700">{pm.date}</td>
                <td className="px-5 py-3 font-semibold text-ink">{pm.amount}</td>
                <td className="px-5 py-3">
                  <Badge tone="ok">{pm.status}</Badge>
                </td>
                <td className="px-5 py-3 text-right">
                  <button className="text-sm font-semibold text-info hover:underline">
                    Receipt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
