import { Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SellerDisputeTimelineEntry } from "@/services/seller-dispute-detail.service";

interface SellerDisputeTimelineProps {
  timeline: SellerDisputeTimelineEntry[];
  currentStatus: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-destructive",
  seller_response_pending: "bg-warning",
  under_review: "bg-primary",
  resolved: "bg-success",
};

const EVENT_COLORS: Record<string, string> = {
  dispute_opened: "bg-destructive",
  seller_dispute_response: "bg-primary",
  evidence_uploaded: "bg-accent-foreground",
  dispute_resolved: "bg-success",
  payout_blocked: "bg-warning",
  payout_released: "bg-success",
  delivery_marked: "bg-primary",
  buyer_confirmed_delivery: "bg-success",
  payment_captured: "bg-primary",
};

const ORDERED_FUTURE_STEPS = ["under_review", "resolved"];

export function SellerDisputeTimeline({ timeline, currentStatus }: SellerDisputeTimelineProps) {
  // Future steps: only for status changes not yet reached
  const reachedStatuses = new Set(
    timeline.filter((t) => t.type === "status_change" && t.status).map((t) => t.status!)
  );
  const currentIdx = ORDERED_FUTURE_STEPS.indexOf(currentStatus);
  const futureSteps = ORDERED_FUTURE_STEPS.filter((step) => {
    const stepIdx = ORDERED_FUTURE_STEPS.indexOf(step);
    return stepIdx > currentIdx && !reachedStatuses.has(step);
  });

  const FUTURE_LABELS: Record<string, string> = {
    under_review: "Review in Progress",
    resolved: "Resolution Issued",
  };

  return (
    <Card id="timeline">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Case Timeline</h3>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="space-y-0">
          {timeline.map((entry, i) => {
            const isLast = i === timeline.length - 1 && futureSteps.length === 0;
            const color =
              entry.type === "status_change"
                ? STATUS_COLORS[entry.status ?? ""] ?? "bg-muted-foreground"
                : EVENT_COLORS[entry.label.toLowerCase().replace(/\s/g, "_")] ?? "bg-muted-foreground";

            return (
              <div key={i} className="relative flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ring-4 ring-background",
                      color
                    )}
                  />
                  {!isLast && <div className="w-0.5 flex-1 bg-border min-h-[2rem]" />}
                </div>
                <div className="pb-6 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                    {entry.type === "event" && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Event
                      </span>
                    )}
                  </div>
                  {entry.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(entry.occurred_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Future placeholder steps */}
          {futureSteps.map((step, i) => {
            const isLast = i === futureSteps.length - 1;
            return (
              <div key={`future-${step}`} className="relative flex gap-4 opacity-40">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0 bg-border ring-4 ring-background" />
                  {!isLast && <div className="w-0.5 flex-1 bg-border min-h-[2rem]" />}
                </div>
                <div className="pb-6 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    {FUTURE_LABELS[step] ?? step.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pending</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
