import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, MessageCircle, ExternalLink, ShieldCheck, Clock, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface RiderLinkCardProps {
  riderUrl: string;
  expiresAt?: string | null;
  handoffCode?: string | null;
  itemTitle?: string | null;
  transactionCode?: string | null;
}

function formatRemaining(expiresAt: string): { label: string; expired: boolean } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: "Expired", expired: true };
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return { label: `${mins} min left`, expired: false };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { label: `${hrs}h ${mins % 60}m left`, expired: false };
  const days = Math.floor(hrs / 24);
  return { label: `${days}d ${hrs % 24}h left`, expired: false };
}

export function RiderLinkCard({
  riderUrl,
  expiresAt,
  handoffCode,
  itemTitle,
  transactionCode,
}: RiderLinkCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? formatRemaining(expiresAt) : null
  );

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(formatRemaining(expiresAt));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(riderUrl);
      setCopied(true);
      toast({ title: "Rider link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const waMessage =
    `SafeDeal delivery — ${itemTitle ?? "your order"}${transactionCode ? ` (${transactionCode})` : ""}.\n\n` +
    `When you arrive, open this link, send the code to the buyer, and ask them to read the 6-digit code back to you:\n${riderUrl}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  return (
    <Card className="rounded-2xl shadow-md p-5 lg:p-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Rider Confirmation Link</h3>
            <p className="text-xs text-muted-foreground">
              Share with whoever delivers — they'll trigger an OTP that the buyer reads back at handoff.
            </p>
          </div>
        </div>
        {remaining && (
          <Badge variant={remaining.expired ? "destructive" : "secondary"} className="gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            {remaining.label}
          </Badge>
        )}
      </div>

      <div className="grid sm:grid-cols-[auto,1fr] gap-4 items-start">
        {/* QR */}
        <div className="bg-white p-3 rounded-xl border self-start mx-auto sm:mx-0">
          <QRCodeSVG value={riderUrl} size={132} level="M" />
          <p className="text-[10px] text-center text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Smartphone className="h-3 w-3" />
            Scan with rider's phone
          </p>
        </div>

        {/* Link + actions */}
        <div className="space-y-3 min-w-0">
          <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shareable URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono break-all bg-background border rounded-md px-2 py-1.5 min-w-0">
                {riderUrl}
              </code>
              <Button size="sm" variant="outline" className="shrink-0" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="default" size="sm" className="rounded-xl">
              <a href={waUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4 mr-1.5" />
                WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <a href={riderUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Open
              </a>
            </Button>
          </div>

          {handoffCode && (
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 mb-0.5">
                Backup handoff code
              </p>
              <p className="font-mono font-bold text-lg text-primary tracking-widest">{handoffCode}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Use only if OTP method is unavailable.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
