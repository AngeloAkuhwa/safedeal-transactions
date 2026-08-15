import { Clock, Snowflake, UserPlus, Pause } from "lucide-react";
import type { AdminHotspot } from "@/services/admin-dashboard.service";
import { useAdminNav } from "../useAdminNav";
import { SEVERITY_BG, SEVERITY_BTN } from "./severity";

const ICONS: Record<AdminHotspot["key"], typeof Clock> = {
  overdue_responses: Clock,
  frozen_escrow: Snowflake,
  flagged_today: UserPlus,
  stale_transactions: Pause,
};

interface Props { items: AdminHotspot[] }

export function OperationalHotspots({ items }: Props) {
  const { go } = useAdminNav();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item, i) => {
        const Icon = ICONS[item.key];
        return (
          <div
            key={item.key}
            className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 ${SEVERITY_BG[item.severity]}`}
          >
            <div className="mb-2 flex items-start gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-md border ${SEVERITY_BG[item.severity]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-semibold leading-none text-foreground tabular-nums">{item.count}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.label}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => go(item.action_href, item.label)}
              className={`mt-2 inline-flex w-full items-center justify-center rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${SEVERITY_BTN[item.severity]} min-h-11`}
            >
              {item.action_label}
            </button>
          </div>
        );
      })}
    </div>
  );
}