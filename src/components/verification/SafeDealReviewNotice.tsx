import { Clock } from "lucide-react";
import { format } from "date-fns";

interface SafeDealReviewNoticeProps {
  deadlineAt: string;
  windowHours: number;
}

export function SafeDealReviewNotice({ deadlineAt, windowHours }: SafeDealReviewNoticeProps) {
  const deadline = new Date(deadlineAt);
  const now = Date.now();
  const totalMs = windowHours * 3_600_000;
  const elapsed = Math.min(totalMs, totalMs - Math.max(0, deadline.getTime() - now));
  const pct = Math.min(100, (elapsed / totalMs) * 100);

  return (
    <div className="bg-warning/5 border-2 border-warning/30 rounded-2xl shadow-lg p-5 lg:p-6">
      <div className="flex items-start gap-3">
        <Clock className="shrink-0 h-5 w-5 text-warning" />
        <div className="flex-1">
          <h3 className="text-base font-bold text-foreground mb-1.5">SafeDeal Review Notice</h3>
          <p className="text-sm text-muted-foreground mb-4">
            If you do not confirm receipt or raise a dispute within the {windowHours}-hour verification window,
            SafeDeal will review the transaction on your behalf before releasing funds to the seller.
            This protects both parties and keeps deals moving in a timely manner.
          </p>
          <div className="bg-card rounded-lg p-4 border border-warning/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-foreground">SafeDeal review scheduled:</span>
              <span className="text-sm font-bold text-warning">
                {format(deadline, "MMM dd, yyyy 'at' h:mm a")}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-warning h-2 rounded-full transition-all duration-1000"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
