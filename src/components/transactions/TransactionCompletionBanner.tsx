import { CheckCircle, Clock, Scale, Download } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CompletionVariant = "buyer_confirmed" | "auto_released" | "dispute_resolved" | "unknown";

export interface TransactionCompletionBannerProps {
  variant: CompletionVariant;
  completedAt: string;
  /** Optional secondary timestamp (e.g. when funds released) */
  fundsReleasedAt?: string | null;
  /** Audience perspective — affects copy */
  perspective: "buyer" | "seller";
  onViewReceipt?: () => void;
  className?: string;
}

const VARIANT_META: Record<CompletionVariant, {
  icon: typeof CheckCircle;
  iconBg: string;
  iconColor: string;
  border: string;
  bg: string;
  badge: string;
}> = {
  buyer_confirmed: {
    icon: CheckCircle,
    iconBg: "bg-success/15",
    iconColor: "text-success",
    border: "border-success/30",
    bg: "bg-success/5",
    badge: "Confirmed by Buyer",
  },
  auto_released: {
    icon: Clock,
    iconBg: "bg-warning/15",
    iconColor: "text-warning",
    border: "border-warning/30",
    bg: "bg-warning/5",
    badge: "Auto-Released",
  },
  dispute_resolved: {
    icon: Scale,
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
    border: "border-primary/30",
    bg: "bg-primary/5",
    badge: "Resolved by SafeDeal",
  },
  unknown: {
    icon: CheckCircle,
    iconBg: "bg-success/15",
    iconColor: "text-success",
    border: "border-success/30",
    bg: "bg-success/5",
    badge: "Completed",
  },
};

function buildCopy(variant: CompletionVariant, perspective: "buyer" | "seller", completedAt: string) {
  const date = format(new Date(completedAt), "MMMM d, yyyy");
  if (variant === "buyer_confirmed") {
    return perspective === "seller"
      ? {
          title: "Buyer Confirmed Receipt",
          body: `The buyer confirmed receipt on ${date}. Funds have been released to your account.`,
        }
      : {
          title: "You Confirmed Receipt",
          body: `You confirmed receipt on ${date} and funds were released to the seller. This transaction is now complete.`,
        };
  }
  if (variant === "auto_released") {
    return perspective === "seller"
      ? {
          title: "Funds Auto-Released",
          body: `The verification window ended on ${date} without a dispute. Funds were automatically released to your account.`,
        }
      : {
          title: "Verification Window Ended",
          body: `The verification window ended on ${date} without a dispute, and funds were automatically released to the seller.`,
        };
  }
  if (variant === "dispute_resolved") {
    return perspective === "seller"
      ? {
          title: "Dispute Resolved — Funds Released",
          body: `The dispute was resolved in your favour on ${date} and funds were released to your account.`,
        }
      : {
          title: "Dispute Resolved",
          body: `The dispute was resolved by the SafeDeal team on ${date}. Funds were released according to the resolution.`,
        };
  }
  return {
    title: "Transaction Completed",
    body: `This transaction was completed on ${date}.`,
  };
}

export function TransactionCompletionBanner({
  variant,
  completedAt,
  fundsReleasedAt,
  perspective,
  onViewReceipt,
  className,
}: TransactionCompletionBannerProps) {
  const meta = VARIANT_META[variant];
  const Icon = meta.icon;
  const copy = buildCopy(variant, perspective, completedAt);

  return (
    <Card className={cn("rounded-2xl shadow-sm border-2 overflow-hidden", meta.border, meta.bg, className)}>
      <div className="p-4 sm:p-5 flex items-start gap-4">
        <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", meta.iconBg)}>
          <Icon className={cn("h-6 w-6", meta.iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base sm:text-lg font-bold text-foreground">{copy.title}</h3>
            <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", meta.border, meta.iconColor, meta.iconBg)}>
              {meta.badge}
            </span>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">{copy.body}</p>

          {fundsReleasedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-semibold">Funds released:</span>{" "}
              {format(new Date(fundsReleasedAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}

          {onViewReceipt && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={onViewReceipt}
            >
              <Download className="h-3.5 w-3.5" />
              View Receipt
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
