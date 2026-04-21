import { FileText, Clock, Shield, TrendingUp, CheckCircle, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SellerMetrics } from "@/services/seller-dashboard.service";

interface SellerMetricsCardsProps {
  metrics: SellerMetrics;
}

function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SellerMetricsCards({ metrics }: SellerMetricsCardsProps) {
  const cards = [
    {
      label: "Transactions Created",
      value: metrics.transactions_created_count.toString(),
      icon: FileText,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      subtitle: "Total protected deals",
      badge: `${metrics.transactions_created_count} total`,
      badgeBg: "bg-primary/10 text-primary",
    },
    {
      label: "Awaiting Buyer Payment",
      value: formatCurrency(metrics.awaiting_buyer_payment_amount),
      icon: Clock,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      subtitle: "Buyer started checkout, payment not completed",
      badge: "Pending",
      badgeBg: "bg-warning/10 text-warning",
    },
    {
      label: "Awaiting Buyer Review",
      value: formatCurrency(metrics.awaiting_buyer_review_amount),
      icon: Eye,
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground",
      subtitle: "Buyer hasn't reviewed agreement yet",
      badge: "Review",
      badgeBg: "bg-muted text-muted-foreground",
    },
    {
      label: "Funds Held in Escrow",
      value: formatCurrency(metrics.funds_held_in_escrow_amount),
      icon: Shield,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      subtitle: "Securely held",
      badge: "Escrow",
      badgeBg: "bg-primary/10 text-primary",
    },
    {
      label: "Funds Pending Release",
      value: formatCurrency(metrics.funds_pending_release_amount),
      icon: TrendingUp,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      subtitle: "Processing release",
      badge: "Releasing",
      badgeBg: "bg-warning/10 text-warning",
    },
    {
      label: "Payouts Completed",
      value: formatCurrency(metrics.payouts_completed_amount),
      icon: CheckCircle,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      subtitle: "Total received",
      badge: "Paid",
      badgeBg: "bg-success/10 text-success",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="rounded-2xl shadow-md hover:shadow-lg transition-all">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`h-11 w-11 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${card.badgeBg}`}>
                {card.badge}
              </span>
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
