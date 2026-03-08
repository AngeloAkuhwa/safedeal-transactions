import { UserCheck, Clock, ImageIcon, XCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DisputeDetailResponse } from "@/services/disputes.service";

interface SellerResponseSectionProps {
  sellerResponse: DisputeDetailResponse["seller_response"];
  responseDueAt: string | null;
}

export function SellerResponseSection({ sellerResponse, responseDueAt }: SellerResponseSectionProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/50 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-bold text-foreground">Seller Response</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            Defendant
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {/* Pending state */}
        {sellerResponse.response_state === "pending" && (
          <div className="text-center py-8 space-y-3">
            <Clock className="h-10 w-10 text-warning mx-auto" />
            <p className="text-base font-semibold text-foreground">
              Awaiting Seller Response
            </p>
            {responseDueAt && (
              <p className="text-sm text-muted-foreground">
                Response due {formatDistanceToNow(new Date(responseDueAt), { addSuffix: true })}
              </p>
            )}
            <div className="border-2 border-dashed border-border rounded-xl p-8 mt-4">
              <p className="text-sm text-muted-foreground">
                The seller's response will appear here once submitted.
              </p>
            </div>
          </div>
        )}

        {/* Responded state */}
        {sellerResponse.response_state === "responded" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Response</p>
              <p className="text-sm text-foreground">{sellerResponse.response_text}</p>
            </div>
            {sellerResponse.submitted_at && (
              <p className="text-xs text-muted-foreground">
                Submitted {format(new Date(sellerResponse.submitted_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}

            {sellerResponse.evidence.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Evidence ({sellerResponse.evidence.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {sellerResponse.evidence.map((e) => (
                    <div
                      key={e.id}
                      className="group relative aspect-square rounded-lg border border-border bg-muted overflow-hidden"
                    >
                      {e.file_url && e.mime_type?.startsWith("image/") ? (
                        <img
                          src={e.file_url}
                          alt={e.file_name ?? "Evidence"}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-8 w-8 mb-1" />
                          <span className="text-xs truncate max-w-[80%]">{e.file_name ?? "File"}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Not responded state */}
        {sellerResponse.response_state === "not_responded" && (
          <div className="text-center py-8 space-y-3">
            <XCircle className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-base font-semibold text-foreground">
              No Response Submitted
            </p>
            <p className="text-sm text-muted-foreground">
              The seller has not submitted a response to this dispute.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
