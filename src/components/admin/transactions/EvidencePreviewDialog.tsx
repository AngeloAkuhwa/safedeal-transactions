import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, FileText, Image as ImageIcon, Video, Receipt, Truck, ExternalLink } from "lucide-react";
import type { AdminTxEvidenceItem } from "@/services/admin-transaction-detail.service";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: AdminTxEvidenceItem | null;
  transactionCode: string;
}

export function EvidencePreviewDialog({ open, onOpenChange, item, transactionCode }: Props) {
  const [iframeFailed, setIframeFailed] = useState(false);
  useEffect(() => {
    setIframeFailed(false);
    if (!open) return;
    const blockKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P" || e.key === "s" || e.key === "S")) {
        e.preventDefault();
      }
    };
    const blockCtx = (e: MouseEvent) => e.preventDefault();
    const origPrint = window.print;
    window.print = () => {};
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("contextmenu", blockCtx);
    return () => {
      window.print = origPrint;
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("contextmenu", blockCtx);
    };
  }, [open]);

  const url = item?.secureUrl ?? null;
  const mime = (item?.mimeType ?? "").toLowerCase();
  const urlLower = (url ?? "").toLowerCase();
  const isPdf =
    mime === "application/pdf" ||
    /\.pdf(\?|$)/i.test(urlLower) ||
    item?.evidenceType === "pdf";
  const isImage = !isPdf && (mime.startsWith("image/") || item?.kind === "image");
  const isVideo = !isPdf && (mime.startsWith("video/") || item?.kind === "video");

  // Force Cloudinary to deliver PDFs inline (not as attachment download)
  const pdfUrl = (() => {
    if (!url || !isPdf) return url;
    if (!/res\.cloudinary\.com/.test(url)) return url;
    if (url.includes("fl_attachment")) return url;
    return url.replace(/\/(image|raw)\/upload\//, "/$1/upload/fl_attachment:false/");
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[88dvh] overflow-hidden p-0"
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base truncate">
              Evidence Preview {item ? `— ${item.title}` : ""}
            </DialogTitle>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="h-3.5 w-3.5" /> Read-only
            </span>
          </div>
        </DialogHeader>
        <div className="relative bg-black/40 max-h-[72dvh] overflow-auto select-none">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="rotate-[-25deg] text-2xl font-black uppercase tracking-widest text-white/10">
              SafeDeal Admin · #{transactionCode}
            </div>
          </div>
          <div className="relative p-6 flex items-center justify-center min-h-[320px]">
            {!url ? (
              <UnsupportedFallback item={item} />
            ) : isImage ? (
              <img
                src={url}
                alt={item?.title ?? "evidence"}
                draggable={false}
                className="max-h-[68dvh] max-w-full rounded shadow-lg pointer-events-none"
              />
            ) : isVideo ? (
              <video
                src={url}
                controls
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                className="max-h-[68dvh] max-w-full rounded shadow-lg"
              />
            ) : isPdf ? (
              iframeFailed ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground py-12">
                  <FileText className="h-10 w-10" />
                  <div className="text-sm">Inline preview blocked by browser.</div>
                  <a
                    href={pdfUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 underline min-h-11"
                  >
                    Open PDF in new tab <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : (
                <iframe
                  src={`${pdfUrl}#toolbar=0&navpanes=0`}
                  title="document"
                  onError={() => setIframeFailed(true)}
                  className="w-full h-[68dvh] rounded bg-white"
                />
              )
            ) : (
              <UnsupportedFallback item={item} />
            )}
          </div>
        </div>
        {item && (
          <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Type: {item.kind}</span>
            {item.uploadedByName && <span>Uploaded by: {item.uploadedByName}</span>}
            {item.uploadedByRole && <span>Role: {item.uploadedByRole}</span>}
            <span>At: {new Date(item.uploadedAt).toLocaleString("en-NG")}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UnsupportedFallback({ item }: { item: AdminTxEvidenceItem | null }) {
  const Icon = item?.kind === "video" ? Video : item?.kind === "receipt" ? Receipt : item?.kind === "delivery_proof" ? Truck : item?.kind === "image" ? ImageIcon : FileText;
  return (
    <div className="flex flex-col items-center gap-3 text-muted-foreground py-12">
      <Icon className="h-10 w-10" />
      <div className="text-sm">Preview unavailable</div>
      {item?.title && <div className="text-xs">{item.title}</div>}
    </div>
  );
}