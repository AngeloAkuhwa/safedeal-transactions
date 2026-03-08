import { Truck, ImageIcon, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DisputeDetailResponse } from "@/services/disputes.service";

interface DeliveryProofSectionProps {
  deliveryProof: DisputeDetailResponse["delivery_proof"];
}

export function DeliveryProofSection({ deliveryProof }: DeliveryProofSectionProps) {
  const hasTracking = deliveryProof.tracking !== null;
  const hasFiles = deliveryProof.files.length > 0;

  if (!hasTracking && !hasFiles) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-bold text-foreground">Delivery Proof</h3>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            No delivery proof has been provided.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tracking = deliveryProof.tracking;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Truck className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Delivery Proof</h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tracking details */}
        {tracking && (
          <div className="grid sm:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            {tracking.courier_name && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Courier</p>
                <p className="text-sm font-medium text-foreground">{tracking.courier_name}</p>
              </div>
            )}
            {tracking.tracking_number && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Tracking Number</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono font-medium text-foreground">{tracking.tracking_number}</p>
                  {tracking.tracking_url && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                      <a href={tracking.tracking_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}
            {tracking.shipped_at && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Shipped</p>
                <p className="text-sm text-foreground">
                  {format(new Date(tracking.shipped_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}
            {tracking.delivered_at && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Delivered</p>
                <p className="text-sm text-foreground">
                  {format(new Date(tracking.delivered_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Proof files */}
        {hasFiles && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Proof Files ({deliveryProof.files.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {deliveryProof.files.map((f) => (
                <div
                  key={f.id}
                  className="group relative aspect-square rounded-lg border border-border bg-muted overflow-hidden"
                >
                  {f.file_url && f.mime_type?.startsWith("image/") ? (
                    <img
                      src={f.file_url}
                      alt={f.file_name ?? "Delivery proof"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mb-1" />
                      <span className="text-xs truncate max-w-[80%]">{f.file_name ?? "File"}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
