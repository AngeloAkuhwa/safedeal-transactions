import { AlertTriangle, CheckCircle2, LineChart, PiggyBank, Undo2, UserPlus, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { AdminActivityItem } from "@/services/admin-dashboard.service";
import { useAdminNav } from "../useAdminNav";
import { formatRelative } from "./relative";

const ICONS: Record<AdminActivityItem["kind"], { icon: typeof LineChart; cls: string }> = {
  transaction_completed: { icon: LineChart, cls: "bg-blue-500/15 text-blue-400" },
  escrow_released: { icon: PiggyBank, cls: "bg-emerald-500/15 text-emerald-400" },
  user_registered: { icon: UserPlus, cls: "bg-purple-500/15 text-purple-400" },
  dispute_opened: { icon: AlertTriangle, cls: "bg-red-500/15 text-red-400" },
  dispute_resolved: { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-400" },
  payout_failed: { icon: XCircle, cls: "bg-red-500/15 text-red-400" },
  refund_issued: { icon: Undo2, cls: "bg-yellow-500/15 text-yellow-400" },
};

interface Props { items: AdminActivityItem[] }

export function RecentActivity({ items }: Props) {
  const { go } = useAdminNav();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
        <button
          type="button"
          onClick={() => go("/admin/audit-logs", "Audit Logs")}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          View All
        </button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No recent activity.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => {
            const cfg = ICONS[it.kind];
            const Icon = cfg.icon;
            return (
              <li
                key={it.id}
                onClick={() => it.action_href && go(it.action_href, it.title)}
                className={`flex items-center justify-between gap-3 py-2.5 ${it.action_href ? "cursor-pointer hover:bg-muted/40 min-h-11" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-md ${cfg.cls}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                      <span className="truncate">{it.title}</span>
                      {typeof it.amount === "number" && it.amount > 0 ? (
                        <span className="shrink-0 text-xs text-foreground/90 tabular-nums">
                          {formatMoney(it.amount, it.currency || "NGN")}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{it.subtitle}</div>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(it.at_iso)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}