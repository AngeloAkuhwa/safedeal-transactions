import { useState } from "react";
import { MessageSquare, Shield, Info, Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SellerResponseForm } from "./SellerResponseForm";
import type { SellerDisputeResponseEntry } from "@/services/seller-dispute-detail.service";

interface SellerDisputeResponseSectionProps {
  disputeId: string;
  disputeStatus: string;
  responses: SellerDisputeResponseEntry[];
  responseCount: number;
  maxResponses: number;
  onRefetch: () => void;
}

export function SellerDisputeResponseSection({
  disputeId,
  disputeStatus,
  responses,
  responseCount,
  maxResponses,
  onRefetch,
}: SellerDisputeResponseSectionProps) {
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);

  const isRespondable = disputeStatus === "open" || disputeStatus === "seller_response_pending";
  const isLocked = disputeStatus === "under_review" || disputeStatus === "resolved";
  const canAddFollowUp = isRespondable && responseCount > 0 && responseCount < maxResponses;
  const showInitialForm = isRespondable && responseCount === 0;

  return (
    <div id="respond" className="space-y-4">
      {/* Submitted responses */}
      {responses.map((r) => (
        <Card key={r.id} className="border-primary/20">
          <CardHeader className="bg-primary/5 border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Your Response</h3>
                  <p className="text-sm text-muted-foreground">
                    Submitted {new Date(r.submitted_at).toLocaleDateString("en-NG", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Respondent
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Response {r.response_number} of {maxResponses}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="rounded-lg bg-muted/50 border border-border p-3">
              <p className="text-sm text-foreground whitespace-pre-wrap">{r.response_text}</p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Initial form when no responses yet */}
      {showInitialForm && (
        <SellerResponseForm
          disputeId={disputeId}
          onSuccess={onRefetch}
          responseNumber={1}
          isFollowUp={false}
        />
      )}

      {/* Follow-up CTA */}
      {canAddFollowUp && !showFollowUpForm && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Add Follow-up Response</p>
                <p className="text-xs text-muted-foreground">
                  You can submit 1 more response to strengthen your case.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFollowUpForm(true)}
            >
              Add Response
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Follow-up form */}
      {canAddFollowUp && showFollowUpForm && (
        <SellerResponseForm
          disputeId={disputeId}
          onSuccess={() => {
            setShowFollowUpForm(false);
            onRefetch();
          }}
          responseNumber={responseCount + 1}
          isFollowUp={true}
        />
      )}

      {/* Max reached */}
      {responseCount >= maxResponses && (
        <div className="rounded-xl border border-border bg-muted/50 p-4 flex items-center gap-3">
          <Info className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Maximum response limit reached</p>
            <p className="text-xs text-muted-foreground">
              You have submitted {maxResponses} of {maxResponses} allowed responses for this dispute.
            </p>
          </div>
        </div>
      )}

      {/* Locked state */}
      {isLocked && responseCount > 0 && (
        <div className="rounded-xl border border-border bg-muted/50 p-4 flex items-center gap-3">
          <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Responses locked</p>
            <p className="text-xs text-muted-foreground">
              {disputeStatus === "resolved"
                ? "This case has been resolved. Responses and evidence uploads are now locked."
                : "This case is under review. New responses are disabled."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
