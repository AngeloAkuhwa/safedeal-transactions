import { useState } from "react";
import { AlertTriangle, User, ExternalLink, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { SellerDisputeEvidence } from "@/services/seller-dispute-detail.service";
import { getCloudinaryThumbnail } from "@/lib/cloudinary";

interface SellerViewBuyerClaimProps {
  reasonLabel: string;
  description: string;
  evidence: SellerDisputeEvidence[];
  buyerName: string | null;
}

function BuyerEvidenceThumb({ e }: { e: SellerDisputeEvidence }) {
  const [imgError, setImgError] = useState(false);
  const isImage = e.file_url && e.mime_type?.startsWith("image/") && !imgError;

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-muted group relative">
      {isImage ? (
        <img
          src={getCloudinaryThumbnail(e.file_url!, 300, 200)}
          alt={e.file_name ?? "Evidence"}
          className="w-full h-28 object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-28 flex flex-col items-center justify-center text-xs text-muted-foreground p-2">
          <ImageIcon className="h-6 w-6 mb-1" />
          <span className="truncate max-w-full">{e.file_name ?? "File"}</span>
        </div>
      )}
      {e.file_url && (
        <a
          href={e.file_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${e.file_name ?? "evidence"} in a new tab`}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 shadow-sm"
        >
          <ExternalLink className="h-3 w-3 text-foreground" />
        </a>
      )}
      <div className="px-2 py-1.5 border-t border-border">
        <p className="text-[10px] text-muted-foreground truncate">
          {new Date(e.created_at).toLocaleDateString("en-NG", {
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}

export function SellerViewBuyerClaim({
  reasonLabel,
  description,
  evidence,
  buyerName,
}: SellerViewBuyerClaimProps) {
  return (
    <Card className="border-destructive/20" id="claim">
      <CardHeader className="bg-destructive/5 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Buyer Claim & Evidence</h3>
              <p className="text-sm text-muted-foreground">
                Filed by {buyerName ?? "the buyer"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs font-semibold bg-destructive/10 text-destructive border-destructive/20">
            <User className="h-3 w-3 mr-1" />
            Claimant
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Dispute Reason</p>
          <Badge variant="secondary" className="text-xs">
            {reasonLabel}
          </Badge>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Buyer's Statement</p>
          <div className="rounded-lg bg-muted/50 border border-border p-3">
            <p className="text-sm text-foreground whitespace-pre-wrap">{description}</p>
          </div>
        </div>

        {evidence.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Buyer Evidence ({evidence.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {evidence.map((e) => (
                <BuyerEvidenceThumb key={e.id} e={e} />
              ))}
            </div>
          </div>
        )}

        {evidence.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No evidence attached by the buyer.</p>
        )}
      </CardContent>
    </Card>
  );
}
