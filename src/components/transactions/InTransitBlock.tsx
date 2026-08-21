import { format } from "date-fns";
import { ExternalLink, Hash, MapPin, Calendar, User, FileText, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeliveryMethodBadge } from "@/components/seller/DeliveryMethodBadge";
import { ProductMediaGallery } from "@/components/transactions/ProductMediaGallery";
import { toast } from "@/hooks/use-toast";
import type {
  TransactionDetailDeliveryTerms,
  TransactionDetailTracking,
  TransactionDispatchEvidenceFile,
} from "@/services/transaction-detail.service";

interface InTransitBlockProps {
  deliveryTerms: TransactionDetailDeliveryTerms | null;
  tracking: TransactionDetailTracking | null;
  dispatchEvidence?: TransactionDispatchEvidenceFile[];
  status: string;
}

function Row({ icon: Icon, label, children }: { icon: typeof Hash; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 text-muted-foreground font-medium">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
      <div className="text-foreground font-semibold text-right break-words">{children}</div>
    </div>
  );
}

function HandoffCodeBlock({ code, prompt }: { code: string; prompt: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({ title: "Code copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };
  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
      <p className="text-xs font-semibold text-primary/80 mb-2 uppercase tracking-wide">{prompt}</p>
      <div className="flex items-center gap-3">
        <span className="font-mono font-bold text-2xl text-primary tabular-nums tracking-widest">{code}</span>
        <Button size="sm" variant="outline" className="h-11 ml-auto" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Only share this code with the seller or rider at the moment of handoff.
      </p>
      <p className="text-xs font-medium text-foreground mt-1">
        The seller will ask for this code at handoff. Don't share it before you have the item in hand.
      </p>
    </div>
  );
}

export function InTransitBlock({ deliveryTerms, tracking, dispatchEvidence = [], status }: InTransitBlockProps) {
  // Fail closed: with no recorded delivery terms we assert nothing about how
  // the item moves: no courier tracking UI for what may be a meetup.
  const method = deliveryTerms?.delivery_method ?? null;
  const handoffCode = tracking?.signature_name ?? null;
  const heading = status === "delivered_awaiting_verification" ? "Delivery Summary" : "What's happening with your package";

  const fullAddress = [
    deliveryTerms?.delivery_address_line1,
    deliveryTerms?.delivery_address_line2,
    deliveryTerms?.delivery_city,
    deliveryTerms?.delivery_state,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base sm:text-lg font-bold text-foreground">{heading}</h2>
        {method && <DeliveryMethodBadge method={method} />}
      </div>

      {!method && (
        <p className="text-sm text-muted-foreground">
          No delivery method is recorded for this transaction yet. Details appear once the seller sets the delivery terms.
        </p>
      )}

      {/* Method-specific body */}
      {method === "courier" && (
        <div className="space-y-1">
          {tracking?.courier_name && (
            <Row icon={User} label="Courier">{tracking.courier_name}</Row>
          )}
          {tracking?.tracking_number && (
            <Row icon={Hash} label="Tracking number">
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{tracking.tracking_number}</span>
            </Row>
          )}
          {tracking?.shipped_at && (
            <Row icon={Calendar} label="Shipped">{format(new Date(tracking.shipped_at), "MMM d, yyyy 'at' h:mm a")}</Row>
          )}
          {(tracking?.expected_delivery_at || deliveryTerms?.expected_delivery_date) && (
            <Row icon={Calendar} label="Expected delivery">
              {format(new Date(tracking?.expected_delivery_at || deliveryTerms!.expected_delivery_date), "MMM d, yyyy")}
            </Row>
          )}
          {tracking?.tracking_url && (
            <a
              href={tracking.tracking_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline min-h-11"
            >
              <ExternalLink className="h-4 w-4" /> Track shipment with carrier
            </a>
          )}
        </div>
      )}

      {method === "pickup" && (
        <div className="space-y-3">
          {tracking?.shipped_at && (
            <Row icon={Calendar} label="Ready for pickup since">
              {format(new Date(tracking.shipped_at), "MMM d, yyyy 'at' h:mm a")}
            </Row>
          )}
          {fullAddress && (
            <Row icon={MapPin} label="Pickup location">{fullAddress}</Row>
          )}
          {handoffCode && <HandoffCodeBlock code={handoffCode} prompt="Show this code at pickup" />}
        </div>
      )}

      {method === "meetup" && (
        <div className="space-y-3">
          {tracking?.shipped_at && (
            <Row icon={Calendar} label="Scheduled handoff">
              {format(new Date(tracking.shipped_at), "MMM d, yyyy 'at' h:mm a")}
            </Row>
          )}
          {fullAddress && (
            <Row icon={MapPin} label="Meetup location">{fullAddress}</Row>
          )}
          {handoffCode && <HandoffCodeBlock code={handoffCode} prompt="Share this code at handoff" />}
        </div>
      )}

      {method === "hand_delivery" && (
        <div className="space-y-1">
          {tracking?.courier_name && (
            <Row icon={User} label="Rider / courier">{tracking.courier_name}</Row>
          )}
          {tracking?.shipped_at && (
            <Row icon={Calendar} label="Dispatched">{format(new Date(tracking.shipped_at), "MMM d, yyyy 'at' h:mm a")}</Row>
          )}
          {handoffCode && <HandoffCodeBlock code={handoffCode} prompt="Confirm this code with the rider" />}
        </div>
      )}

      {/* Rider OTP heads-up: applies to any in-transit method */}
      {(status === "seller_dispatched" || status === "seller_preparing_delivery") && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
          <p className="font-semibold mb-1">If the rider asks for an OTP</p>
          <p className="text-muted-foreground">
            We may text you a 6-digit code if the rider opens the SafeDeal delivery link. Only read it back to them
            <span className="font-semibold"> once you have the item in hand</span>.
          </p>
        </div>
      )}

      {/* Dispatch evidence gallery (any method) */}
      {dispatchEvidence.length > 0 && (
        <div className="pt-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Dispatch evidence from seller
          </div>
          <ProductMediaGallery
            media={dispatchEvidence.map((f) => ({
              file_url: f.file_url,
              secure_url: f.secure_url,
              mime_type: f.mime_type,
            }))}
            title="Dispatch evidence"
            variant="compact"
          />
        </div>
      )}
    </div>
  );
}
