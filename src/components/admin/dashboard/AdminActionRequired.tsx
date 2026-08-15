import {
  CheckCircle2,
  AlertOctagon,
  Scale,
  Hourglass,
  IdCard,
  Webhook,
  ArrowRight,
} from "lucide-react";
import type { AdminActionItem } from "@/services/admin-dashboard.service";
import { useAdminNav } from "../useAdminNav";
import { SEVERITY_BG, SEVERITY_BTN } from "./severity";

const ICONS: Record<AdminActionItem["key"], typeof CheckCircle2> = {
  awaiting_release: CheckCircle2,
  failed_payouts: AlertOctagon,
  disputes_needing_decision: Scale,
  stuck_transactions: Hourglass,
  identity_reviews_pending: IdCard,
  webhook_recon_issues: Webhook,
};

interface AdminActionRequiredProps {
  items: AdminActionItem[];
}

export function AdminActionRequired({ items }: AdminActionRequiredProps) {
  const { go } = useAdminNav();

  return (
    <section
      aria-label="Admin action required"
      className="rounded-xl border border-border bg-card/60 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Admin Action Required</h2>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Internal queues
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {items.map((item, i) => {
          const Icon = ICONS[item.key];
          return (
            <div
              key={item.key}
              className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} flex flex-col rounded-lg border bg-card p-3 transition-all hover:-translate-y-0.5 ${SEVERITY_BG[item.severity]}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${SEVERITY_BG[item.severity]} border`}> 
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-xl font-semibold text-foreground tabular-nums">{item.count}</div>
              </div>
              <div className="mb-3 text-xs leading-snug text-foreground/90">{item.label}</div>
              <button
                type="button"
                onClick={() => go(item.action_href, item.label)}
                className={`mt-auto inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${SEVERITY_BTN[item.severity]} min-h-11 min-w-11`}
              >
                {item.action_label}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}