import { Scale, Clock, Hourglass, CheckCircle2, Wallet } from "lucide-react";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { SellerDisputeSummary } from "@/services/seller-disputes.service";

interface Props {
  summary: SellerDisputeSummary;
}

export function SellerDisputeSummaryCards({ summary }: Props) {
  const cards = [
    {
      label: "Open Disputes",
      value: String(summary.open_count),
      subtitle: "Currently active cases",
      icon: Scale,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      badgeLabel: "Active",
      badgeBg: "bg-destructive/10 text-destructive",
      tooltip:
        "Active dispute cases not yet resolved. Includes both cases where you need to respond and cases SafeDeal is reviewing.",
    },
    {
      label: "Awaiting Your Response",
      value: String(summary.awaiting_response_count),
      subtitle: "Respond before the deadline",
      icon: Clock,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      badgeLabel: "Urgent",
      badgeBg: "bg-warning/10 text-warning",
      tooltip:
        "Cases where SafeDeal needs your evidence or rebuttal. Always respond before the deadline shown on each case.",
    },
    {
      label: "Under Review",
      value: String(summary.under_review_count),
      subtitle: "With SafeDeal for review",
      icon: Hourglass,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      badgeLabel: "In Review",
      badgeBg: "bg-primary/10 text-primary",
      tooltip:
        "SafeDeal is weighing both sides. No action needed from you right now — we'll notify you when there's an update.",
    },
    {
      label: "Resolved",
      value: String(summary.resolved_count),
      subtitle: "Cases with final outcome",
      icon: CheckCircle2,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      badgeLabel: "Closed",
      badgeBg: "bg-success/10 text-success",
      tooltip:
        "Cases with a final outcome — funds released, refunded, or partially refunded.",
    },
    {
      label: "Payouts Blocked",
      value: formatMoneyOrDash(summary.blocked_payout_amount, summary.blocked_payout_currency),
      subtitle: "Your seller net currently held by active disputes",
      icon: Wallet,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      badgeLabel: "On Hold",
      badgeBg: "bg-warning/10 text-warning",
      tooltip: "Your seller net currently held due to active disputes. Matches the blocked-funds list on the Payouts tab.",
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {cards.map((card, idx) => (
        <Card key={card.label} className={`sd-card sd-metric h-full sd-fade-in-stagger sd-delay-${idx + 1}`}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between mb-2">
              <div className={`h-7 w-7 rounded-md ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-[14px] w-[14px] ${card.iconColor}`} />
              </div>
              <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[9px] font-semibold ${card.badgeBg}`}>
                {card.badgeLabel}
              </span>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1">
                {card.label}
                {("tooltip" in card) && card.tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label="More info" className="inline-flex text-muted-foreground/60 hover:text-muted-foreground relative inline-flex items-center justify-center before:absolute before:-inset-4 before:content-['']">
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">{card.tooltip}</TooltipContent>
                  </Tooltip>
                )}
              </p>
              <p className="sd-kpi-value tabular-nums">{card.value}</p>
              <p className="sd-kpi-helper">{card.subtitle}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    </TooltipProvider>
  );
}
