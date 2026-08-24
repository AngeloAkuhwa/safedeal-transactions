import type { DisputeSlaBuckets, PaymentHealthRow } from "@/services/admin-dashboard.service";
import { SEVERITY_DOT } from "./severity";

/** Severity arrives from an edge function; an out-of-union value must not
 *  silently drop the dot (`SEVERITY_DOT[x]` would render the class "undefined"). */
const UNKNOWN_SEVERITY_DOT = "bg-slate-500";

interface Props {
  sla: DisputeSlaBuckets;
  payments: PaymentHealthRow[];
}

export function RiskAndPaymentHealth({ sla, payments }: Props) {
  const total = sla.due_soon + sla.overdue + sla.escalated + sla.under_review || 1;
  const segments = [
    { key: "due_soon", label: "Due soon", value: sla.due_soon, color: "bg-amber-400" },
    { key: "overdue", label: "Overdue", value: sla.overdue, color: "bg-orange-500" },
    { key: "escalated", label: "Escalated", value: sla.escalated, color: "bg-red-500" },
    { key: "under_review", label: "Under review", value: sla.under_review, color: "bg-blue-500" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* Dispute SLA Pressure */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Dispute SLA Pressure</h3>
          <span className="text-xs text-muted-foreground">{total} open</span>
        </div>
        <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((s) => (
            <div
              key={s.key}
              className={s.color}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
        </div>
        <ul className="space-y-2">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${s.color}`} />
                <span className="text-foreground/90">{s.label}</span>
              </div>
              <span className="font-medium text-foreground tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Payment Health */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Payment Health</h3>
        <ul className="divide-y divide-border">
          {payments.map((row) => (
            <li key={row.key} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex items-center gap-2.5">
                <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[row.severity] ?? UNKNOWN_SEVERITY_DOT}`} />
                <span className="text-foreground/90">{row.label}</span>
              </div>
              <span className="font-semibold text-foreground tabular-nums">
                {row.count.toLocaleString("en-NG")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}