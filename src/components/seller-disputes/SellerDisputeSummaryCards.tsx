import { Scale, Clock, Hourglass, CheckCircle2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SellerDisputeSummary } from "@/services/seller-disputes.service";

function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
    },
    {
      label: "Payouts Blocked",
      value: formatCurrency(summary.blocked_payout_amount),
      subtitle: "Held due to active disputes",
      icon: Wallet,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      badgeLabel: "On Hold",
      badgeBg: "bg-warning/10 text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="rounded-2xl shadow-md hover:shadow-lg transition-all">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`h-11 w-11 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${card.badgeBg}`}>
                {card.badgeLabel}
              </span>
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
