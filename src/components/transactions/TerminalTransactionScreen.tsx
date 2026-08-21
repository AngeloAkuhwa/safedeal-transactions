import { useNavigate } from "react-router";
import { XCircle, Clock, CheckCircle, ShieldAlert, RefreshCcw, ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TerminalStatus =
  | "cancelled"
  | "expired"
  | "completed"
  | "disputed"
  | "refunded"
  | "paid";

interface Props {
  status: TerminalStatus;
  transactionCode?: string | null;
  timestamp?: string | null;
  /** When true, the primary action is "View Agreement" instead of "Back to Marketplace". */
  transactionId?: string | null;
}

const COPY: Record<TerminalStatus, { icon: typeof XCircle; title: string; subtitle: string; tone: "destructive" | "warning" | "success" | "primary" }> = {
  cancelled: {
    icon: XCircle,
    title: "Transaction Cancelled",
    subtitle: "This transaction was cancelled and can no longer be paid. Start a fresh checkout from the marketplace to buy this item.",
    tone: "destructive",
  },
  expired: {
    icon: Clock,
    title: "Agreement Expired",
    subtitle: "This payment window has expired. Start a fresh checkout from the marketplace to buy this item.",
    tone: "warning",
  },
  completed: {
    icon: CheckCircle,
    title: "Transaction Completed",
    subtitle: "This transaction is already complete. You can view the full agreement and receipt from your dashboard.",
    tone: "success",
  },
  disputed: {
    icon: ShieldAlert,
    title: "Transaction Under Dispute",
    subtitle: "This transaction is in dispute review and cannot accept further payment actions. Track progress from your dashboard.",
    tone: "warning",
  },
  refunded: {
    icon: RefreshCcw,
    title: "Transaction Refunded",
    subtitle: "This transaction was refunded. Start a new checkout if you'd like to buy this item again.",
    tone: "primary",
  },
  paid: {
    icon: CheckCircle,
    title: "Payment Already Secured",
    subtitle: "Funds for this transaction are already held in escrow. Open the agreement to track delivery and verification.",
    tone: "success",
  },
};

const FALLBACK_TONE = { bg: "bg-muted/40", iconBg: "bg-muted", text: "text-foreground", border: "border-border" };

const TONE_CLASSES: Record<string, { bg: string; iconBg: string; text: string; border: string }> = {
  destructive: { bg: "bg-destructive/5", iconBg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30" },
  warning: { bg: "bg-warning/5", iconBg: "bg-warning/10", text: "text-warning", border: "border-warning/30" },
  success: { bg: "bg-success/5", iconBg: "bg-success/10", text: "text-success", border: "border-success/30" },
  primary: { bg: "bg-primary/5", iconBg: "bg-primary/10", text: "text-primary", border: "border-primary/30" },
};

function formatStamp(ts?: string | null): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

export function TerminalTransactionScreen({ status, transactionCode, timestamp, transactionId }: Props) {
  const navigate = useNavigate();
  const cfg = COPY[status];
  const tone = TONE_CLASSES[cfg.tone] ?? FALLBACK_TONE;
  const Icon = cfg.icon;
  const stamp = formatStamp(timestamp);

  const showAgreementCTA = status === "completed" || status === "paid" || status === "disputed";

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div className={`max-w-md w-full bg-card rounded-2xl shadow-xl border ${tone.border} overflow-hidden`}>
        <div className={`h-1.5 ${tone.bg}`} />
        <div className="p-6 sm:p-8 text-center">
          <div className={`w-16 h-16 ${tone.iconBg} rounded-full flex items-center justify-center mx-auto mb-5`}>
            <Icon className={`h-8 w-8 ${tone.text}`} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">{cfg.title}</h2>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{cfg.subtitle}</p>

          {(transactionCode || stamp) && (
            <div className="bg-muted/60 rounded-xl p-4 mb-6 text-left space-y-2">
              {transactionCode && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Transaction</span>
                  <span className="text-xs font-mono font-semibold text-foreground">#{transactionCode}</span>
                </div>
              )}
              {stamp && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {status === "cancelled" ? "Cancelled" : status === "expired" ? "Expired" : status === "completed" ? "Completed" : status === "refunded" ? "Refunded" : "Updated"}
                  </span>
                  <span className="text-xs font-semibold text-foreground">{stamp}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            {showAgreementCTA && transactionId ? (
              <Button onClick={() => navigate(`/dashboard/transactions/${transactionId}/agreement`)} className="w-full">
                View Agreement
              </Button>
            ) : (
              <Button onClick={() => navigate("/marketplace")} className="w-full">
                <ShoppingBag className="h-4 w-4 mr-2" />
                Back to Marketplace
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Maps a raw `transactions.status` value into a TerminalStatus, or null if the
 * transaction is still in the payable / pre-payment window.
 */
export function deriveTerminalStatus(status: string | null | undefined): TerminalStatus | null {
  switch (status) {
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "completed":
    case "released":
      return "completed";
    case "disputed":
      return "disputed";
    case "refunded":
      return "refunded";
    case "payment_secured":
    case "seller_preparing_delivery":
    case "seller_dispatched":
    case "delivered_awaiting_verification":
      return "paid";
    default:
      return null; // awaiting_payment, draft, awaiting_buyer, etc. Still payable
  }
}