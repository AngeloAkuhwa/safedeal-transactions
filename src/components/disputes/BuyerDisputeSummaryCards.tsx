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
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.key}
            className="p-6 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 ${card.iconBg} rounded-xl flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${card.badgeBg}`}>
                {card.badge}
              </span>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">
              {summary[card.key]}
            </div>
            <div className="text-sm text-muted-foreground font-medium">
              {card.label}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
