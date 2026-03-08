import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { Bell, Package, Truck, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DashboardNotification } from "@/services/dashboard.service";
import { formatDistanceToNow } from "date-fns";

interface RecentNotificationsProps {
  notifications: DashboardNotification[];
}

function getNotificationStyle(type: string) {
  switch (type) {
    case "delivery_update":
      return {
        bg: "bg-success/5 border-success/20",
        iconBg: "bg-success/10",
        iconColor: "text-success",
        icon: Package,
        buttonClass: "bg-success text-success-foreground hover:bg-success/90",
        actionLabel: "View Delivery",
      };
    case "transaction_update":
      return {
        bg: "bg-primary/5 border-primary/20",
        iconBg: "bg-primary/10",
        iconColor: "text-primary",
        icon: Truck,
        buttonClass: "bg-primary text-primary-foreground hover:bg-primary/90",
        actionLabel: "View Transaction",
      };
    case "dispute_update":
      return {
        bg: "bg-destructive/5 border-destructive/20",
        iconBg: "bg-destructive/10",
        iconColor: "text-destructive",
        icon: Scale,
        buttonClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        actionLabel: "View Dispute",
      };
    default:
      return {
        bg: "bg-primary/5 border-primary/20",
        iconBg: "bg-primary/10",
        iconColor: "text-primary",
        icon: Bell,
        buttonClass: "bg-primary text-primary-foreground hover:bg-primary/90",
        actionLabel: "View",
      };
  }
}

function resolveNotificationRoute(notif: DashboardNotification): string | null {
  switch (notif.type) {
    case "dispute_update":
      return "/dashboard/disputes";
    case "delivery_update":
    case "transaction_update":
      return notif.transaction_id
        ? `/dashboard/transactions/${notif.transaction_id}`
        : "/dashboard/transactions";
    case "security_alert":
    case "account_update":
      return "/dashboard/profile";
    default:
      if (notif.transaction_id) {
        return `/dashboard/transactions/${notif.transaction_id}`;
      }
      return null;
  }
}

export function RecentNotifications({ notifications }: RecentNotificationsProps) {
  const navigate = useNavigate();

  return (
    <Card className="shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Recent Notifications</CardTitle>
        </div>
        <Link
          to="/dashboard/notifications"
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          View All
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No recent notifications
          </p>
        ) : (
          notifications.map((notif) => {
            const style = getNotificationStyle(notif.type);
            const Icon = style.icon;
            const route = resolveNotificationRoute(notif);
            return (
              <div
                key={notif.id}
                className={`rounded-xl border p-4 ${style.bg} transition-colors`}
              >
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-lg ${style.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon className={`h-5 w-5 ${style.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-foreground text-sm">{notif.title}</h4>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{notif.message}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {route ? (
                        <Button
                          size="sm"
                          className={style.buttonClass}
                          onClick={() => navigate(route)}
                        >
                          {style.actionLabel}
                        </Button>
                      ) : (
                        <Button size="sm" className={style.buttonClass} disabled>
                          {style.actionLabel}
                        </Button>
                      )}
                      {notif.transaction_id && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          Transaction linked
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
