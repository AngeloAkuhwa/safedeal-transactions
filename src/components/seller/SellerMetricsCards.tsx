import { FileText, Clock, Shield, TrendingUp, CheckCircle, Eye, Info, CheckCircle2, Scale, AlertOctagon, ShieldAlert } from "lucide-react";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { Link } from "react-router";
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

export function SellerMetricsCards({ metrics }: SellerMetricsCardsProps) {
  // Money aggregates carry no zero fallback: the server sends a real 0 for
  // "none", so an absent field is an error and must dash, not claim ₦0.00.
  // Number(x) > 0 keeps the gating behaviour (absent gates closed).
  const netPaidToBank = metrics.net_paid_to_bank;
  const netPendingBankTransfer = metrics.net_pending_bank_transfer;
  const fundsFrozenAmount = metrics.funds_frozen_amount;
  const fundsFrozenCount = metrics.funds_frozen_count ?? 0;
  // Denomination of every aggregate below. Null when the seller has rows in
  // more than one currency (or none). We render `—` rather than pick one.
  const currency = metrics.currency_code;

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
      value: formatMoneyOrDash(metrics.awaiting_buyer_payment_amount, currency),
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
      value: formatMoneyOrDash(metrics.awaiting_buyer_review_amount, currency),
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
      value: formatMoneyOrDash(metrics.funds_held_in_escrow_amount, currency),
      icon: Shield,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      subtitle: "Your net earnings currently locked in escrow",
      tooltip: "Your protected earnings currently held by SafeDeal until the transaction is confirmed.",
      badge: "Escrow",
      badgeBg: "bg-primary/10 text-primary",
      breakdown: null as string | null,
    },
    ...(Number(fundsFrozenAmount) > 0
      ? [{
          label: "Funds Frozen",
          value: formatMoneyOrDash(fundsFrozenAmount, currency),
          icon: ShieldAlert,
          iconBg: "bg-destructive/10",
          iconColor: "text-destructive",
          subtitle: `${fundsFrozenCount} transaction${fundsFrozenCount === 1 ? "" : "s"} under dispute`,
          tooltip: "Your net earnings frozen because a buyer raised a dispute. Funds will be released once the dispute is resolved in your favour.",
          badge: "Frozen",
          badgeBg: "bg-destructive/10 text-destructive",
          breakdown: null as string | null,
        }]
      : []),
    {
      label: "Funds Pending Release",
      value: formatMoneyOrDash(metrics.funds_pending_release_amount, currency),
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
      value: formatMoneyOrDash(metrics.payouts_completed_amount, currency),
      icon: CheckCircle,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      subtitle: "Net released to you · payout in progress for some",
      tooltip:
        "Total amount you've earned from completed deals after SafeDeal fees. Some may still be queued for bank transfer. See the Payouts tab for actual deposit status.",
      badge: "Paid",
      badgeBg: "bg-success/10 text-success",
      breakdown:
        Number(netPendingBankTransfer) > 0
          ? `${formatMoneyOrDash(netPaidToBank, currency)} paid to bank · ${formatMoneyOrDash(netPendingBankTransfer, currency)} pending bank transfer`
          : null,
    },
  ];

  const chips = [
    {
      key: "awaiting_seller_confirmation",
      label: "Awaiting your confirmation",
      value: metrics.awaiting_seller_confirmation_count ?? 0,
      icon: CheckCircle2,
      href: "/seller/transactions?filter=awaiting-seller-confirmation",
      tone: "border-warning/30 bg-warning/10 text-foreground hover:bg-warning/15",
      iconClass: "text-warning",
    },
    {
      key: "awaiting_release",
      label: "Awaiting Release",
      value: metrics.awaiting_release_count ?? 0,
      icon: Clock,
      href: "/seller/payouts?status=pending",
      tone: "border-primary/30 bg-primary/10 text-foreground hover:bg-primary/15",
      iconClass: "text-primary",
    },
    {
      key: "open_disputes",
      label: "Open disputes",
      value: metrics.open_disputes_count ?? 0,
      icon: Scale,
      href: "/seller/disputes",
      tone: "border-warning/30 bg-warning/10 text-foreground hover:bg-warning/15",
      iconClass: "text-warning",
    },
    {
      key: "payout_failed",
      label: "Releases failed",
      value: metrics.payout_failed_count ?? 0,
      icon: AlertOctagon,
      href: "/seller/payouts?status=failed",
      tone: "bg-destructive/5 text-foreground border-destructive/40 hover:bg-destructive/10",
      iconClass: "text-destructive",
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((card, idx) => (
          <Card
            key={card.label}
            className={`sd-card sd-metric h-full sd-fade-in-stagger sd-delay-${Math.min(idx + 1, 6)}`}
          >
            <CardContent className="p-4 flex flex-col h-full">
              <div className="flex items-start justify-between mb-2.5">
                <div className={`h-9 w-9 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                  <card.icon className={`h-[18px] w-[18px] ${card.iconColor}`} />
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${card.badgeBg}`}>
                  {card.badge}
                </span>
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">{card.label}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`More info about ${card.label}`}
                        className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0 relative before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {card.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="sd-kpi-value tabular-nums">{card.value}</p>
                <p className="sd-kpi-helper">{card.subtitle}</p>
                {card.breakdown && (
                  <p className="text-xs text-muted-foreground/80 pt-1 leading-snug">
                    {card.breakdown}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <p className="sd-eyebrow mb-2">
          Activity at a glance
        </p>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              to={chip.href}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all hover:-translate-y-0.5 min-w-[170px] justify-between ${chip.tone} min-h-11 min-w-11 justify-center`}
            >
              <span className="inline-flex items-center gap-1.5">
                <chip.icon className={`h-3.5 w-3.5 ${chip.iconClass}`} />
                <span>{chip.label}</span>
              </span>
              <span className="inline-flex items-center justify-center rounded-full bg-background/70 px-1.5 py-0.5 text-xs font-bold">
                {chip.value}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
