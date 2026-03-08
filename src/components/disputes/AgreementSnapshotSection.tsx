import { Lock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DisputeDetailResponse } from "@/services/disputes.service";

interface AgreementSnapshotSectionProps {
  snapshot: DisputeDetailResponse["agreement_snapshot"];
}

export function AgreementSnapshotSection({ snapshot }: AgreementSnapshotSectionProps) {
  if (!snapshot) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-bold text-foreground">Locked Agreement</h3>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            Locked agreement details are unavailable.
          </p>
        </CardContent>
      </Card>
    );
  }

  const json = snapshot.snapshot_json;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Locked Agreement</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Locked {format(new Date(snapshot.locked_at), "MMM d, yyyy")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
          <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-foreground">
            This agreement was locked after payment and cannot be changed. It serves as the truth reference for this dispute.
          </p>
        </div>

        <div className="bg-muted rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs text-foreground whitespace-pre-wrap break-words">
            {JSON.stringify(json, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
