import { useState } from "react";
import { MessageSquare, Shield, Info, Lock, Plus, Pencil, X, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { SellerResponseForm } from "./SellerResponseForm";
import { editSellerResponse } from "@/services/seller-dispute-detail.service";
import type { SellerDisputeResponseEntry, SellerDisputePermissions } from "@/services/seller-dispute-detail.service";

interface SellerDisputeResponseSectionProps {
  disputeId: string;
  disputeStatus: string;
  responses: SellerDisputeResponseEntry[];
  responseCount: number;
  maxResponses: number;
  permissions: SellerDisputePermissions;
  onRefetch: () => void;
}

export function SellerDisputeResponseSection({
  disputeId,
  disputeStatus,
  responses,
  responseCount,
  maxResponses,
  permissions,
  onRefetch,
}: SellerDisputeResponseSectionProps) {
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const isLocked = disputeStatus === "under_review" || disputeStatus === "resolved";
  const latestResponseId = responses.length > 0 ? responses[responses.length - 1].id : null;

  const startEdit = (r: SellerDisputeResponseEntry) => {
    setEditingId(r.id);
    setEditText(r.response_text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async () => {
    if (editText.trim().length < 10) {
      toast.error("Response must be at least 10 characters.");
      return;
    }
    setSaving(true);
    try {
      await editSellerResponse(disputeId, editingId!, editText.trim());
      toast.success("Response updated successfully.");
      setEditingId(null);
      setEditText("");
      onRefetch();
    } catch (err) {
      toast.error((err as Error).message || "Failed to update response.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="respond" className="space-y-4">
      {/* Submitted responses */}
      {responses.map((r) => {
        const isEditing = editingId === r.id;
        const canEdit = permissions.canEditLatestResponse && r.id === latestResponseId && !isEditing;

        return (
          <Card key={r.id} className="border-primary/20">
            <CardHeader className="bg-primary/5 border-b border-border pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-primary" />
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
                      {r.edited_at && (
                        <span className="ml-2 text-xs italic text-muted-foreground">
                          · Edited on {new Date(r.edited_at).toLocaleDateString("en-NG", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
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
              {isEditing ? (
                <div className="space-y-3">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={6}
                    maxLength={5000}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{editText.length}/5000</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                      <Button size="sm" onClick={saveEdit} disabled={saving || editText.trim().length < 10}>
                        <Check className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg bg-muted/50 border border-border p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{r.response_text}</p>
                  </div>
                  {canEdit && (
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => startEdit(r)}>
                        <Pencil className="h-3 w-3" /> Edit Response
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Initial form when no responses yet */}
      {permissions.canSubmitInitialResponse && (
        <SellerResponseForm
          disputeId={disputeId}
          onSuccess={onRefetch}
          responseNumber={1}
          isFollowUp={false}
        />
      )}

      {/* Follow-up CTA */}
      {permissions.canAddFollowUpResponse && !showFollowUpForm && (
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
      {permissions.canAddFollowUpResponse && showFollowUpForm && (
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
