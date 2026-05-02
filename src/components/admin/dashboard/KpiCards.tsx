import { Receipt, PiggyBank, Users, Flag, TrendingUp, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import type { AdminKpis } from "@/services/admin-dashboard.service";

interface KpiCardsProps {
  kpis: AdminKpis;
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const tiles = [
    {
      icon: Receipt,
      iconClass: "bg-blue-500/15 text-blue-400",
      label: "Total Transactions",
      value: kpis.total_transactions.toLocaleString("en-NG"),
      delta: kpis.total_transactions_delta_pct,
    },
    {
      icon: PiggyBank,
      iconClass: "bg-emerald-500/15 text-emerald-400",
      label: "Escrow Balance",
      value: formatMoney(kpis.escrow_balance_amount, "NGN"),
      delta: kpis.escrow_balance_delta_pct,
      tooltip: "Funds currently held or frozen in escrow. Excludes released and refunded amounts.",
    },
    {
      icon: Users,
      iconClass: "bg-purple-500/15 text-purple-400",
      label: "Active Users",
      value: kpis.active_users.toLocaleString("en-NG"),
      delta: kpis.active_users_delta_pct,
    },
    {
      icon: Flag,
      iconClass: "bg-red-500/15 text-red-400",
      label: "Flagged Activity",
      value: kpis.flagged_activity.toLocaleString("en-NG"),
      delta: kpis.flagged_activity_delta_pct,
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          const positive = t.delta >= 0;
          const card = (
            <div
              key={t.label}
              className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} group rounded-xl border border-slate-800 bg-slate-900 p-4 transition-all hover:-translate-y-0.5 hover:border-slate-700`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${t.iconClass}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div
                  className={`flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-400" : "text-red-400"}`}
                >
                  {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {positive ? "+" : ""}
                  {t.delta.toFixed(1)}%
                </div>
              </div>
              <div className="text-xs text-slate-400">{t.label}</div>
              <div className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">{t.value}</div>
            </div>
          );
          if (t.tooltip) {
            return (
              <Tooltip key={t.label}>
                <TooltipTrigger asChild>{card}</TooltipTrigger>
                <TooltipContent className="max-w-[260px] border-slate-700 bg-slate-800 text-slate-100">
                  {t.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          }
          return card;
        })}
      </div>
    </TooltipProvider>
  );
}