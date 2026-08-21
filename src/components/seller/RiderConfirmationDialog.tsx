import { useState } from "react";
import { Copy, Check, MessageCircle, ExternalLink, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface RiderConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  riderUrl: string;
  handoffCode?: string | null;
  itemTitle?: string | null;
  transactionCode?: string | null;
}

export function RiderConfirmationDialog({
  open,
  onClose,
  riderUrl,
  handoffCode,
  itemTitle,
  transactionCode,
}: RiderConfirmationDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(riderUrl);
      setCopied(true);
      toast({ title: "Link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const waMessage =
    `SafeDeal delivery: ${itemTitle ?? "your order"}${transactionCode ? ` (${transactionCode})` : ""}.\n\n` +
    `When you arrive, open this link, send the code to the buyer, and ask them to read the 6-digit code back to you:\n${riderUrl}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Send link to your rider</DialogTitle>
          </div>
          <DialogDescription>
            Share this link with whoever is delivering. They'll open it, trigger an OTP to the buyer, and the buyer
            will read the 6-digit code at handoff.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rider link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono break-all bg-background border rounded-md px-2 py-1.5">
                {riderUrl}
              </code>
              <Button size="sm" variant="outline" className="shrink-0" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {handoffCode && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary/80 mb-1">
                Backup handoff code
              </p>
              <p className="font-mono font-bold text-xl text-primary tracking-widest">{handoffCode}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use this only if the OTP method is unavailable.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="default" className="rounded-xl">
              <a href={waUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4 mr-2" />
                Share on WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <a href={riderUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open link
              </a>
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
