import { useNavigate } from "react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Clock, Package, Truck, Scale, Lock, CreditCard, Info,
  AlertTriangle, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { NotificationItem } from "@/services/notifications.service";
import { keyActivate } from "@/lib/a11y";

interface NotificationListProps {
  items: NotificationItem[];
  onMarkRead: (id: string) => void;
}

const UI_TYPE_STYLES: Record<string, {
  borderColor: string;
  iconBg: string;
  iconColor: string;
  icon: typeof Clock;
  actionClass: string;
}> = {
  verification_reminders: {
    borderColor: "border-l-warning",
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    icon: Clock,
    actionClass: "bg-warning text-warning-foreground hover:bg-warning/90",
  },
  delivery_updates: {
    borderColor: "border-l-success",
    iconBg: "bg-success/10",
    iconColor: "text-success",
    icon: Package,
    actionClass: "bg-success text-success-foreground hover:bg-success/90",
  },
  transaction_updates: {
    borderColor: "border-l-muted-foreground",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    icon: Info,
    actionClass: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  },
  disputes: {
    borderColor: "border-l-destructive",
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    icon: Scale,
    actionClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
  payments: {
    borderColor: "border-l-success",
    iconBg: "bg-success/10",
    iconColor: "text-success",
    icon: CreditCard,
    actionClass: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  },
  system_alerts: {
    borderColor: "border-l-muted-foreground",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    icon: AlertTriangle,
    actionClass: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  },
};

// Pick the right icon based on metadata event_type or db_type
function getItemIcon(item: NotificationItem) {
  if (item.db_type === "delivery_update") {
    return item.primary_action?.label === "Track Shipment" ? Truck : Package;
  }
  if (item.db_type === "payment_update") {
    // Escrow-related: use Lock
    const meta = (item as unknown as Record<string, unknown>);
    if (item.title?.toLowerCase().includes("escrow") || item.title?.toLowerCase().includes("funds held")) {
      return Lock;
    }
    return CreditCard;
  }
  return UI_TYPE_STYLES[item.ui_type]?.icon || Info;
}

const UI_TYPE_LABELS: Record<string, string> = {
  verification_reminders: "Verification Reminder",
  delivery_updates: "Delivery Update",
  transaction_updates: "Transaction Update",
  disputes: "Dispute",
  payments: "Payment",
  system_alerts: "System Alert",
};

export function NotificationList({ items, onMarkRead }: NotificationListProps) {
  const navigate = useNavigate();

  return (
    <Card className="sd-card overflow-hidden">
      <div className="divide-y divide-border">
        {items.map((item) => {
          const style = UI_TYPE_STYLES[item.ui_type] || UI_TYPE_STYLES.system_alerts;
          const Icon = getItemIcon(item);
          const isUnread = !item.is_read;

          return (
            <div role="button" tabIndex={0} onKeyDown={keyActivate}
              key={item.id}
              className={`p-3 hover:bg-accent/50 transition-colors cursor-pointer border-l-4 ${style.borderColor} ${
                isUnread ? "bg-primary/[0.02]" : ""
              }`}
              onClick={() => {
                if (isUnread) onMarkRead(item.id);
                if (item.primary_action?.route) navigate(item.primary_action.route);
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`h-9 w-9 ${style.iconBg} rounded-lg flex items-center justify-center shrink-0`}
                >
                  <Icon className={`h-4 w-4 ${style.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={`text-sm text-foreground ${isUnread ? "font-bold" : "font-semibold"}`}>
                        {item.title}
                      </h4>
                      {isUnread && item.ui_type === "verification_reminders" && (
                        <Badge className="bg-warning/10 text-warning border-warning/20 font-bold px-1.5 py-0">
                          Urgent
                        </Badge>
                      )}
                      {isUnread && item.ui_type !== "verification_reminders" && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 font-bold px-1.5 py-0">
                          Unread
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{item.message}</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    {item.primary_action && (
                      <Button
                        size="sm"
                        className={`${style.actionClass} min-h-11 text-xs`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isUnread) onMarkRead(item.id);
                          navigate(item.primary_action!.route);
                        }}
                      >
                        {item.primary_action.label}
                      </Button>
                    )}
                    {item.transaction?.code && (
                      <span
                        className={`text-xs font-bold ${
                          item.ui_type === "disputes"
                            ? "text-destructive"
                            : item.ui_type === "verification_reminders"
                            ? "text-warning"
                            : item.ui_type === "delivery_updates" || item.ui_type === "payments"
                            ? "text-success"
                            : item.ui_type === "transaction_updates"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        #{item.transaction.code}
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                      <Tag className="h-2.5 w-2.5 mr-1" />
                      {UI_TYPE_LABELS[item.ui_type] || "Notification"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
