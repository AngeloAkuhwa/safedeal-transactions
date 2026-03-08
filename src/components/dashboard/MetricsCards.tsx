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
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {cards.map((card) => (
        <Card key={card.key} className="shadow-md hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`h-12 w-12 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <span className={`text-xs font-semibold ${card.badgeColor} ${card.badgeBg} px-3 py-1 rounded-full`}>
                {card.badge}
              </span>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">
              {metrics[card.key]}
            </div>
            <div className="text-sm text-muted-foreground font-medium">{card.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
