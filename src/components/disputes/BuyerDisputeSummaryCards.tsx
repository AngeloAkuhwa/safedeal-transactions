import { Scale, Hourglass, CheckCircle, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { BuyerDisputeSummary } from "@/services/disputes.service";

interface BuyerDisputeSummaryCardsProps {
  summary: BuyerDisputeSummary;
}

const cards = [
  {
    key: "open_count" as const,
    label: "Open Disputes",
    badge: "Open",
    icon: Scale,
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    badgeBg: "bg-destructive/10 text-destructive",
  },
  {
    key: "under_review_count" as const,
    label: "Under Review",
    badge: "Review",
    icon: Hourglass,
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    badgeBg: "bg-warning/10 text-warning",
  },
  {
    key: "resolved_count" as const,
    label: "Resolved",
    badge: "Resolved",
    icon: CheckCircle,
    iconBg: "bg-success/10",
    iconColor: "text-success",
    badgeBg: "bg-success/10 text-success",
  },
  {
    key: "funds_frozen_count" as const,
    label: "Funds Frozen",
    badge: "Frozen",
    icon: Lock,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    badgeBg: "bg-primary/10 text-primary",
  },
];

export function BuyerDisputeSummaryCards({ summary }: BuyerDisputeSummaryCardsProps) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.key}
            className="sd-metric p-3 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`w-8 h-8 ${card.iconBg} rounded-lg flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
              <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-full ${card.badgeBg}`}>
                {card.badge}
              </span>
            </div>
            <div className="sd-kpi-value tabular-nums">
              {summary[card.key]}
            </div>
            <div className="text-xs text-muted-foreground font-medium mt-0.5">
              {card.label}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
