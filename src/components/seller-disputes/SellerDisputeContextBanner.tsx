import { AlertTriangle, Info, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellerDisputeDetailResponse } from "@/services/seller-dispute-detail.service";

interface SellerDisputeContextBannerProps {
  status: string;
  responseDueAt: string | null;
  isPayoutBlocked: boolean;
  hasResponse: boolean;
}

interface BannerConfig {
  icon: React.ReactNode;
  title: string;
  message: string;
  className: string;
}

function formatDeadline(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffH <= 0) return "Overdue";
  if (diffH <= 24) return `${diffH} hours`;
  const diffD = Math.ceil(diffH / 24);
  return `${diffD} day${diffD > 1 ? "s" : ""}`;
}

export function SellerDisputeContextBanner({
  status,
  responseDueAt,
  isPayoutBlocked,
  hasResponse,
}: SellerDisputeContextBannerProps) {
  const banners: BannerConfig[] = [];

  // Response needed banner
  if ((status === "open" || status === "seller_response_pending") && !hasResponse) {
    const deadline = formatDeadline(responseDueAt);
    const isOverdue = deadline === "Overdue";
    banners.push({
      icon: <AlertTriangle className="h-5 w-5 flex-shrink-0" />,
      title: isOverdue ? "Response Overdue" : "Response Required",
      message: isOverdue
        ? "Your response deadline has passed. Submit your response immediately to avoid an automatic ruling against you."
        : `Your response is required. Submit your side of the case with supporting evidence before the deadline.${deadline ? ` You have ${deadline} left.` : ""}`,
      className: "border-warning/30 bg-warning/5 text-warning",
    });
  }

  // Under review banner
  if (status === "under_review") {
    banners.push({
      icon: <Info className="h-5 w-5 flex-shrink-0" />,
      title: "Case Under Review",
      message:
        "This case is under review. Both your evidence and the buyer's claim are being evaluated by our team.",
      className: "border-primary/30 bg-primary/5 text-primary",
    });
  }

  // Resolved banner
  if (status === "resolved") {
    banners.push({
      icon: <CheckCircle2 className="h-5 w-5 flex-shrink-0" />,
      title: "Dispute Resolved",
      message:
        "This dispute has been resolved. Review the final decision and payout impact below.",
      className: "border-success/30 bg-success/5 text-success",
    });
  }

  // Payout blocked banner
  if (isPayoutBlocked) {
    banners.push({
      icon: <Lock className="h-5 w-5 flex-shrink-0" />,
      title: "Payout Blocked",
      message:
        "Your payout for this transaction is currently blocked while this dispute is active. Funds will be released or refunded based on the resolution.",
      className: "border-destructive/30 bg-destructive/5 text-destructive",
    });
  }

  if (banners.length === 0) return null;

  return (
    <div className="space-y-3">
      {banners.map((banner, i) => (
        <div
          key={i}
          className={cn(
            "rounded-xl border p-4 flex items-start gap-3",
            banner.className
          )}
        >
          {banner.icon}
          <div>
            <p className="text-sm font-semibold">{banner.title}</p>
            <p className="text-sm mt-0.5 opacity-90">{banner.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
