import { AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SellerAlert } from "@/services/seller-dashboard.service";

interface SellerAlertBannersProps {
  alerts: SellerAlert[];
}

const alertConfig: Record<string, {
  icon: typeof AlertTriangle;
  bgClass: string;
  borderClass: string;
  iconClass: string;
  textClass: string;
}> = {
  delivery_proof_needed: {
    icon: AlertTriangle,
    bgClass: "bg-warning/10",
    borderClass: "border-warning/30",
    iconClass: "text-warning",
    textClass: "text-warning",
  },
  buyer_verification_active: {
    icon: Clock,
    bgClass: "bg-primary/10",
    borderClass: "border-primary/30",
    iconClass: "text-primary",
    textClass: "text-primary",
  },
  payout_releasing: {
    icon: TrendingUp,
    bgClass: "bg-success/10",
    borderClass: "border-success/30",
    iconClass: "text-success",
    textClass: "text-success",
  },
};

export function SellerAlertBanners({ alerts }: SellerAlertBannersProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map((alert, i) => {
        const config = alertConfig[alert.type] ?? alertConfig.delivery_proof_needed;
        const Icon = config.icon;
        return (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-xl border p-4 ${config.bgClass} ${config.borderClass}`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${config.iconClass}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${config.textClass}`}>{alert.title}</p>
              <p className="text-xs text-muted-foreground">{alert.message}</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0">
              {alert.action_label}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
