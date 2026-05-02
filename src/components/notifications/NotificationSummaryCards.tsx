import { Mail, Clock, Scale, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { NotificationSummary } from "@/services/notifications.service";

interface NotificationSummaryCardsProps {
  summary: NotificationSummary;
}

const cards = [
  {
    key: "unread_count" as const,
    label: "Unread Notifications",
    icon: Mail,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    key: "verification_deadlines_count" as const,
    label: "Verification Deadlines",
    icon: Clock,
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
  },
  {
    key: "active_disputes_count" as const,
    label: "Active Disputes",
    icon: Scale,
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
  },
  {
    key: "escrow_alerts_count" as const,
    label: "Escrow Alerts",
    icon: Lock,
    iconBg: "bg-success/10",
    iconColor: "text-success",
  },
];

export function NotificationSummaryCards({ summary }: NotificationSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.key}
            className={`sd-card sd-metric p-3 sd-fade-in-stagger sd-delay-${Math.min(idx + 1, 6)}`}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="sd-kpi-value tabular-nums">
                  {summary[card.key]}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {card.label}
                </div>
              </div>
              <div
                className={`h-8 w-8 ${card.iconBg} rounded-lg flex items-center justify-center shrink-0`}
              >
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
