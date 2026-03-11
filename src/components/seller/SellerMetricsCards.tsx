import { FileText, Clock, Shield, TrendingUp, CheckCircle } from "lucide-react";
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
    },
    {
      label: "Awaiting Buyer Payment",
      value: formatCurrency(metrics.awaiting_buyer_payment_amount),
      icon: Clock,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      subtitle: "Pending buyer action",
    },
    {
      label: "Funds Held in Escrow",
      value: formatCurrency(metrics.funds_held_in_escrow_amount),
      icon: Shield,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      subtitle: "Securely held",
    },
    {
      label: "Funds Pending Release",
      value: formatCurrency(metrics.funds_pending_release_amount),
      icon: TrendingUp,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      subtitle: "Processing release",
    },
    {
      label: "Payouts Completed",
      value: formatCurrency(metrics.payouts_completed_amount),
      icon: CheckCircle,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      subtitle: "Total received",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-10 w-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
            <p className="text-xl font-bold text-foreground mt-1">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
