import { AlertTriangle, Clock, TrendingUp, ArrowRight } from "lucide-react";
import type { SellerAlert } from "@/services/seller-dashboard.service";

interface SellerAlertBannersProps {
  alerts: SellerAlert[];
}

const alertConfig: Record<string, {
  icon: typeof AlertTriangle;
  bgClass: string;
  borderClass: string;
  iconClass: string;
  titleClass: string;
  bodyClass: string;
  linkClass: string;
}> = {
  delivery_proof_needed: {
    icon: AlertTriangle,
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
    borderClass: "border-l-4 border-amber-500",
    iconClass: "text-amber-600",
    titleClass: "text-amber-900 dark:text-amber-200",
    bodyClass: "text-amber-700 dark:text-amber-300",
    linkClass: "text-amber-700 hover:text-amber-900 dark:text-amber-300",
  },
  buyer_verification_active: {
    icon: Clock,
    bgClass: "bg-sky-50 dark:bg-sky-950/30",
    borderClass: "border-l-4 border-primary",
    iconClass: "text-primary",
    titleClass: "text-sky-900 dark:text-sky-200",
    bodyClass: "text-sky-700 dark:text-sky-300",
    linkClass: "text-sky-700 hover:text-sky-900 dark:text-sky-300",
  },
  payout_releasing: {
    icon: TrendingUp,
    bgClass: "bg-green-50 dark:bg-green-950/30",
    borderClass: "border-l-4 border-green-500",
    iconClass: "text-green-600",
    titleClass: "text-green-900 dark:text-green-200",
    bodyClass: "text-green-700 dark:text-green-300",
    linkClass: "text-green-700 hover:text-green-900 dark:text-green-300",
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
            className={`flex items-center gap-3 rounded-lg p-4 shadow-sm ${config.bgClass} ${config.borderClass}`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${config.iconClass}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${config.titleClass}`}>{alert.title}</p>
              <p className={`text-sm ${config.bodyClass}`}>{alert.message}</p>
            </div>
            <button className={`inline-flex items-center gap-1 text-sm font-semibold shrink-0 ${config.linkClass} transition-colors`}>
              {alert.action_label}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
