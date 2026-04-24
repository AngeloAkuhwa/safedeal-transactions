import { FileText, Clock, Shield, TrendingUp, CheckCircle, Eye, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SellerMetrics } from "@/services/seller-dashboard.service";

interface SellerMetricsCardsProps {
  metrics: SellerMetrics;
}

function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SellerMetricsCards({ metrics }: SellerMetricsCardsProps) {
  const netPaidToBank = metrics.net_paid_to_bank ?? 0;
  const netPendingBankTransfer = metrics.net_pending_bank_transfer ?? 0;

  const cards = [
    {
      label: "Transactions Created",
      value: metrics.transactions_created_count.toString(),
      icon: FileText,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      subtitle: "All protected deals you've created",
      tooltip: "Count of every protected transaction you've created on SafeDeal.",
      badge: `${metrics.transactions_created_count} total`,
      badgeBg: "bg-primary/10 text-primary",
      breakdown: null as string | null,
    },
    {
      label: "Awaiting Buyer Payment",
      value: formatCurrency(metrics.awaiting_buyer_payment_amount),
      icon: Clock,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      subtitle: "Gross amount · buyer hasn't paid yet",
      tooltip: "Buyer started checkout but payment isn't complete yet. Shown as gross buyer amount.",
      badge: "Pending",
      badgeBg: "bg-warning/10 text-warning",
      breakdown: null as string | null,
    },
    {
      label: "Awaiting Buyer to Open Link",
      value: formatCurrency(metrics.awaiting_buyer_review_amount),
      icon: Eye,
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground",
      subtitle: "Gross amount · share link not opened/agreement not reviewed yet",
      tooltip:
        "Buyers you've sent a transaction link to, but they haven't opened or reviewed the agreement yet. Send them a reminder if it's been more than a day.",
      badge: "Review",
      badgeBg: "bg-muted text-muted-foreground",
      breakdown: null as string | null,
    },
    {
      label: "Funds Held in Escrow",
      value: formatCurrency(metrics.funds_held_in_escrow_amount),
      icon: Shield,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      subtitle: "Your net earnings currently locked in escrow",
      tooltip: "Your protected earnings currently held by SafeDeal until the transaction is confirmed.",
      badge: "Escrow",
      badgeBg: "bg-primary/10 text-primary",
      breakdown: null as string | null,
    },
    {
      label: "Funds Pending Release",
      value: formatCurrency(metrics.funds_pending_release_amount),
      icon: TrendingUp,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      subtitle: "Net approved · not yet paid out",
      tooltip: "Money approved for payout but not yet sent to your account.",
      badge: "Releasing",
      badgeBg: "bg-warning/10 text-warning",
      breakdown: null as string | null,
    },
    {
      label: "Net Earned (Completed)",
      value: formatCurrency(metrics.payouts_completed_amount),
      icon: CheckCircle,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      subtitle: "Net released to you · payout in progress for some",
      tooltip:
        "Total amount you've earned from completed deals after SafeDeal fees. Some may still be queued for bank transfer — see the Payouts tab for actual deposit status.",
      badge: "Paid",
      badgeBg: "bg-success/10 text-success",
      breakdown:
        netPendingBankTransfer > 0
          ? `${formatCurrency(netPaidToBank)} paid to bank · ${formatCurrency(netPendingBankTransfer)} pending bank transfer`
          : null,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="rounded-2xl shadow-md hover:shadow-lg transition-all">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`h-11 w-11 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${card.badgeBg}`}>
                  {card.badge}
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`More info about ${card.label}`}
                        className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {card.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                {card.breakdown && (
                  <p className="text-[11px] text-muted-foreground/80 pt-1 leading-snug">
                    {card.breakdown}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
