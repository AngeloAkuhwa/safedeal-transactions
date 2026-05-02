import { Clock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DisputeDetailTimelineEntry } from "@/services/disputes.service";
import { resolveDisputeLabel } from "@/lib/status-labels";

interface DisputeTimelineProps {
  timeline: DisputeDetailTimelineEntry[];
  currentStatus: string;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Dispute Opened",
  seller_response_pending: "Seller Notified",
  under_review: "Review in Progress",
  resolved: "Resolution Issued",
};

const labelFor = (status: string) =>
  STATUS_LABELS[status] ?? resolveDisputeLabel(status, "seller").label;

const STATUS_COLORS: Record<string, string> = {
  open: "bg-destructive",
  seller_response_pending: "bg-warning",
  under_review: "bg-primary",
  resolved: "bg-success",
};

const ORDERED_STEPS = ["open", "seller_response_pending", "under_review", "resolved"];

export function DisputeTimeline({ timeline, currentStatus }: DisputeTimelineProps) {
  // Synthesize "Seller Notified" if open exists but seller_response_pending doesn't
  const hasOpen = timeline.some((t) => t.new_status === "open");
  const hasSellerPending = timeline.some((t) => t.new_status === "seller_response_pending");

  let enrichedTimeline = [...timeline];
  if (hasOpen && !hasSellerPending) {
    const openEntry = timeline.find((t) => t.new_status === "open");
    if (openEntry) {
      const openIdx = enrichedTimeline.findIndex((t) => t.new_status === "open");
      enrichedTimeline.splice(openIdx + 1, 0, {
        old_status: "open",
        new_status: "seller_response_pending",
        reason: "Seller automatically notified",
        changed_at: openEntry.changed_at,
      });
    }
  }

  const reachedStatuses = new Set(enrichedTimeline.map((t) => t.new_status));

  // Find where the current status sits in the ordered flow
  const currentIdx = ORDERED_STEPS.indexOf(currentStatus);

  // Future steps: only those AFTER current status AND not already reached
  const futureSteps = ORDERED_STEPS.filter((step) => {
    const stepIdx = ORDERED_STEPS.indexOf(step);
    return stepIdx > currentIdx && !reachedStatuses.has(step);
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Case Timeline</h3>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="space-y-0">
          {/* Actual timeline entries */}
          {enrichedTimeline.map((entry, i) => {
            const isLast = i === enrichedTimeline.length - 1 && futureSteps.length === 0;
            const color = STATUS_COLORS[entry.new_status] ?? "bg-muted-foreground";

            return (
              <div key={i} className="relative flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={cn("w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ring-4 ring-background", color)} />
                  {!isLast && <div className="w-0.5 flex-1 bg-border min-h-[2rem]" />}
                </div>
                <div className="pb-6 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {labelFor(entry.new_status)}
                  </p>
                  {entry.reason && (
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(entry.changed_at), "MMM d, yyyy 'at' h:mm a")}
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
                    {labelFor(step)}
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
