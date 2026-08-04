import { Mail, LifeBuoy, Siren, ScrollText, Bell, Landmark } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAdminNav } from "@/components/admin/useAdminNav";

const CHANNELS = [
  {
    icon: Mail,
    label: "Support inbox",
    value: "support@safedeal.ng",
    hint: "Buyer and seller tickets. First response target: 4 business hours.",
  },
  {
    icon: Siren,
    label: "Escalation channel",
    value: "escalations@safedeal.ng",
    hint: "Frozen escrow, payout failures, and suspected fraud. Paged immediately.",
  },
  {
    icon: LifeBuoy,
    label: "On-call rota",
    value: "Weekdays 08:00–20:00 WAT",
    hint: "Outside these hours, use the escalation channel for money-movement incidents only.",
  },
];

const TOOLS = [
  {
    icon: ScrollText,
    label: "Audit Logs",
    href: "/admin/audit-logs",
    hint: "Who changed what, when, and why — start every investigation here.",
  },
  {
    icon: Bell,
    label: "Notifications",
    href: "/admin/notifications",
    hint: "Delivery status and retries for buyer, seller, and system alerts.",
  },
  {
    icon: Landmark,
    label: "Reconciliation",
    href: "/admin/reconciliation",
    hint: "Escrow drift, pricing snapshot coverage, and financial remediation.",
  },
];

export default function AdminSupport() {
  const { go } = useAdminNav();

  return (
    <AdminLayout title="Support Center" subtitle="Contact channels and first-line debugging">
      <div className="space-y-6 p-4 md:p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Contact channels
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.label} className="p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {c.label}
                  </div>
                  <div className="mt-2 text-sm text-foreground">{c.value}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Debug &amp; audit basics
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <Card key={t.href} className="flex flex-col justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {t.label}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 self-start"
                    onClick={() => go(t.href, t.label)}
                  >
                    Open {t.label}
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>

        <Card className="p-4">
          <div className="text-sm font-medium text-foreground">Escalation checklist</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Capture the transaction code and the exact time the issue was reported.</li>
            <li>Check Audit Logs for the last state change on the record.</li>
            <li>For money movement, confirm the ledger position on Reconciliation before acting.</li>
            <li>Record the outcome as a transaction note so the next agent has full context.</li>
          </ol>
        </Card>
      </div>
    </AdminLayout>
  );
}