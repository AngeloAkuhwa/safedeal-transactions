import { supportLink } from "@/lib/support/support-copy";
import { useState } from "react";
import { ShieldAlert, ImageIcon, FileText, Film, Download } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DisputeDetailResponse } from "@/services/disputes.service";
import type { DisputeDetailEvidence } from "@/services/disputes.service";

interface BuyerClaimSectionProps {
  reasonLabel: string;
  claim: DisputeDetailResponse["buyer_claim"];
}

function EvidenceIcon({ mime }: { mime: string | null }) {
  if (mime?.startsWith("video/")) return <Film className="h-8 w-8 mb-1" />;
  if (mime === "application/pdf") return <FileText className="h-8 w-8 mb-1" />;
  return <ImageIcon className="h-8 w-8 mb-1" />;
}

function EvidenceThumbnail({
  evidence,
  onClick,
}: {
  evidence: DisputeDetailEvidence;
  onClick: () => void;
}) {
  const isImage = evidence.mime_type?.startsWith("image/");
  const [imgError, setImgError] = useState(false);

  /* The container used to be a <button> with a download <a> inside it. Nested
     interactive content is invalid HTML: it produces two tab stops per
     thumbnail and browsers disagree on which control a click activates. The
     container is now a plain positioned div; "view" is a stretched button
     covering the tile, and the download link sits above it on its own tier. */
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted transition-all hover:ring-2 hover:ring-primary/40">
      <button
        type="button"
        onClick={onClick}
        aria-label={`View ${evidence.file_name ?? "evidence"}`}
        className="absolute inset-0 z-rail rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {isImage && evidence.file_url && !imgError ? (
        <img
          src={evidence.file_url}
          alt={evidence.file_name ?? "Evidence"}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
          <EvidenceIcon mime={evidence.mime_type} />
          <span className="text-xs truncate max-w-[80%]">
            {evidence.file_name ?? "File"}
          </span>
        </div>
      )}

      {/* Download sits above the stretched view button so it stays clickable. */}
      {evidence.file_url && (
        <a
          href={evidence.file_url}
          download={evidence.file_name ?? "evidence"}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Download ${evidence.file_name ?? "evidence"}`}
          className="absolute right-1.5 top-1.5 z-sticky flex h-11 w-11 items-center justify-center rounded-md bg-background/90 text-foreground transition-opacity hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-foreground/60 px-2 py-1 text-xs text-background">
        {format(new Date(evidence.created_at), "MMM d, h:mm a")}
      </div>
    </div>
  );
}

function EvidenceViewer({
  evidence,
  open,
  onOpenChange,
}: {
  evidence: DisputeDetailEvidence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!evidence) return null;

  const isImage = evidence.mime_type?.startsWith("image/");
  const isVideo = evidence.mime_type?.startsWith("video/");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm truncate">
              {evidence.file_name ?? "Evidence"}
            </DialogTitle>
            {evidence.file_url && (
              <Button variant="outline" size="sm" asChild className="flex-shrink-0">
                <a
                  href={evidence.file_url}
                  download={evidence.file_name ?? "evidence"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </a>
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex items-center justify-center min-h-[200px]">
          {isImage && evidence.file_url && (
            <img
              src={evidence.file_url}
              alt={evidence.file_name ?? "Evidence"}
              className="max-w-full max-h-[70vh] rounded-lg object-contain"
            />
          )}
          {isVideo && evidence.file_url && (
            <video
              src={evidence.file_url}
              controls
              className="max-w-full max-h-[70vh] rounded-lg"
            />
          )}
          {!isImage && !isVideo && evidence.file_url && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground py-8">
              <EvidenceIcon mime={evidence.mime_type} />
              <p className="text-sm">{evidence.file_name ?? "File"}</p>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={evidence.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open File
                </a>
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          {format(new Date(evidence.created_at), "MMM d, yyyy · h:mm a")}
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function BuyerClaimSection({ reasonLabel, claim }: BuyerClaimSectionProps) {
  const [viewerEvidence, setViewerEvidence] = useState<DisputeDetailEvidence | null>(null);

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-primary/20 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold text-foreground">Your Evidence</h3>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/20">
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
                  <EvidenceThumbnail
                    key={e.id}
                    evidence={e}
                    onClick={() => setViewerEvidence(e)}
                  />
                ))}
              </div>
            </div>
          )}

          {claim.evidence.length === 0 && (
            <p className="text-sm italic text-muted-foreground">No evidence submitted yet.</p>
          )}

          {/* Submitted evidence is deliberately not removable: a dispute is an
              audit trail, and letting either side withdraw a file after the
              other has seen it would break that. Saying so is better than a
              silently read-only panel, which reads as a missing feature. */}
          {claim.evidence.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Evidence stays on the case once submitted, so both sides and our
              team see the same record.{" "}
              <a href={supportLink()} className="font-medium text-primary underline underline-offset-2">
                Attached the wrong file? Tell support
              </a>{" "}
              and it will be noted on the case.
            </p>
          )}
        </CardContent>
      </Card>

      <EvidenceViewer
        evidence={viewerEvidence}
        open={!!viewerEvidence}
        onOpenChange={(open) => !open && setViewerEvidence(null)}
      />
    </>
  );
}
