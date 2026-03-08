import { ShieldAlert, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DisputeDetailResponse } from "@/services/disputes.service";

interface BuyerClaimSectionProps {
  reasonLabel: string;
  claim: DisputeDetailResponse["buyer_claim"];
}

export function BuyerClaimSection({ reasonLabel, claim }: BuyerClaimSectionProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/20 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Your Evidence</h3>
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
            Claimant
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Reason</p>
          <p className="text-sm font-semibold text-foreground">{reasonLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Description</p>
          <p className="text-sm text-foreground">{claim.description}</p>
        </div>

        {claim.evidence.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Evidence ({claim.evidence.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {claim.evidence.map((e) => (
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
                  <div className="absolute bottom-0 inset-x-0 bg-foreground/60 text-background text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                    {format(new Date(e.created_at), "MMM d, h:mm a")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {claim.evidence.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No evidence submitted yet.</p>
        )}
      </CardContent>
      <CardFooter className="border-t border-border">
        <Button variant="outline" size="sm" className="w-full" disabled>
          Upload Additional Evidence
        </Button>
      </CardFooter>
    </Card>
  );
}
