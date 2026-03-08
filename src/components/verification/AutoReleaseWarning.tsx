import { Clock } from "lucide-react";
import { format } from "date-fns";

interface AutoReleaseWarningProps {
  deadlineAt: string;
  deliveredAt: string | null;
}

export function AutoReleaseWarning({ deadlineAt }: AutoReleaseWarningProps) {
  const deadline = new Date(deadlineAt);
  const now = Date.now();
  const totalMs = 72 * 3_600_000;
  const elapsed = Math.min(totalMs, totalMs - Math.max(0, deadline.getTime() - now));
  const pct = Math.min(100, (elapsed / totalMs) * 100);

  return (
    <div className="bg-warning/5 border-2 border-warning/30 rounded-2xl shadow-lg p-6 lg:p-8">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-warning/10 rounded-xl flex items-center justify-center shrink-0">
          <Clock className="h-7 w-7 text-warning" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-foreground mb-2">Automatic Release Notice</h3>
          <p className="text-sm text-muted-foreground mb-4">
            If you do not confirm receipt or raise a dispute within the 72-hour verification window,
            the funds will automatically be released to the seller. This protects both parties and
            ensures transactions are completed in a timely manner.
          </p>
          <div className="bg-card rounded-lg p-4 border border-warning/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-foreground">Auto-release scheduled:</span>
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
