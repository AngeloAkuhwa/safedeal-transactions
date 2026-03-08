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
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.key}
            className="p-5 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {summary[card.key]}
                </div>
                <div className="text-xs text-muted-foreground font-medium mt-1">
                  {card.label}
                </div>
              </div>
              <div
                className={`w-10 h-10 ${card.iconBg} rounded-lg flex items-center justify-center`}
              >
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
