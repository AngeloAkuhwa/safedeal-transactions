import { CheckCircle, Scale, Printer, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FUND_RELEASE_REVIEW_TARGET } from "@/lib/support/support-copy";

export type CompletionVariant = "buyer_confirmed" | "dispute_resolved" | "unknown";

export interface TransactionCompletionBannerProps {
  variant: CompletionVariant;
  completedAt: string;
  /** When funds actually released. If null/undefined, banner shows the
   * "Awaiting Release" pre-release state and ignores the released copy. */
  fundsReleasedAt?: string | null;
  perspective: "buyer" | "seller";
  /** Opens the browser print dialog for the receipt. */
  onPrintReceipt?: () => void;
  className?: string;
}

type Meta = {
  icon: typeof CheckCircle;
  iconBg: string;
  iconColor: string;
  border: string;
  bg: string;
  badge: string;
};

const VARIANT_META: Record<CompletionVariant, Meta> = {
  buyer_confirmed: {
    icon: CheckCircle,
    iconBg: "bg-success/15",
    iconColor: "text-success",
    border: "border-success/30",
    bg: "bg-success/5",
    badge: "Confirmed by Buyer",
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

// Pre-release calm-primary state shown whenever funds have NOT been released yet.
const AWAITING_RELEASE_META: Meta = {
  icon: ShieldCheck,
  iconBg: "bg-primary/15",
  iconColor: "text-primary",
  border: "border-primary/30",
  bg: "bg-primary/5",
  badge: "In SafeDeal Review",
};

function buildReleasedCopy(
  variant: CompletionVariant,
  perspective: "buyer" | "seller",
  completedAt: string,
) {
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
  // Defensive fallback for the "unknown" variant.
  return {
    title: "Transaction Completed",
    body: `This transaction was completed on ${date}.`,
  };
}

function buildAwaitingCopy(
  perspective: "buyer" | "seller",
  completedAt: string,
) {
  const date = format(new Date(completedAt), "MMMM d, yyyy");
  return perspective === "buyer"
    ? {
        title: "You Confirmed Receipt",
        body: `You confirmed receipt on ${date}. SafeDeal is reviewing and will release funds to the seller shortly.`,
      }
    : {
        title: "Buyer Confirmed Receipt",
        body: `The buyer confirmed receipt on ${date}. SafeDeal will release your funds after review — typically within ${FUND_RELEASE_REVIEW_TARGET}.`,
      };
}

export function TransactionCompletionBanner({
  variant,
  completedAt,
  fundsReleasedAt,
  perspective,
  onPrintReceipt,
  className,
}: TransactionCompletionBannerProps) {
  const isReleased = !!fundsReleasedAt;

  const meta = isReleased ? VARIANT_META[variant] : AWAITING_RELEASE_META;
  const copy = isReleased
    ? buildReleasedCopy(variant, perspective, completedAt)
    : buildAwaitingCopy(perspective, completedAt);
  const Icon = meta.icon;

  return (
    <Card className={cn("rounded-2xl shadow-sm border-2 overflow-hidden", meta.border, meta.bg, className)}>
      <div className="p-4 sm:p-5 flex items-start gap-4">
        <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", meta.iconBg)}>
          <Icon className={cn("h-6 w-6", meta.iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base sm:text-lg font-bold text-foreground">{copy.title}</h3>
            <span className={cn("text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", meta.border, meta.iconColor, meta.iconBg)}>
              {meta.badge}
            </span>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">{copy.body}</p>

          {isReleased && fundsReleasedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-semibold">Funds released:</span>{" "}
              {format(new Date(fundsReleasedAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}

          {onPrintReceipt && isReleased && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={onPrintReceipt}
            >
              <Printer className="h-3.5 w-3.5" />
              Print receipt
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
