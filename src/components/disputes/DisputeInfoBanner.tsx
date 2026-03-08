import { Info } from "lucide-react";

interface DisputeInfoBannerProps {
  status: string;
}

export function DisputeInfoBanner({ status }: DisputeInfoBannerProps) {
  let message = "";

  if (status === "open" || status === "seller_response_pending") {
    message =
      "Seller has been notified. Funds remain protected while the dispute is active.";
  } else if (status === "under_review") {
    message =
      "Our dispute team is reviewing the available evidence and will update this case when a decision is made.";
  } else if (status === "resolved") {
    message =
      "This dispute has been resolved. Review the final decision below.";
  }

  if (!message) return null;

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
      <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
      <p className="text-sm text-foreground">{message}</p>
    </div>
  );
}
