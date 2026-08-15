import { ShoppingBag, Truck, ClipboardCheck, Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { BuyerDashboardMetrics } from "@/services/dashboard.service";

interface MetricsCardsProps {
  metrics: BuyerDashboardMetrics;
}

const cards = [
  {
    key: "active_purchases" as const,
    label: "Active Purchases",
    badge: "Active",
    icon: ShoppingBag,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    badgeBg: "bg-primary/10",
    badgeColor: "text-primary",
  },
  {
    key: "awaiting_delivery" as const,
    label: "Awaiting Delivery",
    badge: "Pending",
    icon: Truck,
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    badgeBg: "bg-warning/10",
    badgeColor: "text-warning",
  },
  {
    key: "awaiting_verification" as const,
    label: "Awaiting Verification",
    badge: "Action Needed",
    icon: ClipboardCheck,
    iconBg: "bg-success/10",
    iconColor: "text-success",
    badgeBg: "bg-success/10",
    badgeColor: "text-success",
  },
  {
    key: "open_disputes" as const,
    label: "Open Disputes",
    badge: "Review",
    icon: Scale,
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    badgeBg: "bg-destructive/10",
    badgeColor: "text-destructive",
  },
];

export function MetricsCards({ metrics }: MetricsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, idx) => (
        <Card
          key={card.key}
          className={`sd-card sd-metric sd-fade-in-stagger sd-delay-${Math.min(idx + 1, 6)}`}
        >
          <CardContent className="p-3">
            <div className="flex items-start justify-between mb-2">
              <div className={`h-8 w-8 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
              <span className={`text-[12px] font-semibold ${card.badgeColor} ${card.badgeBg} px-1.5 py-0.5 rounded-full`}>
                {card.badge}
              </span>
            </div>
            <div className="sd-kpi-value tabular-nums">
              {metrics[card.key]}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{card.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
