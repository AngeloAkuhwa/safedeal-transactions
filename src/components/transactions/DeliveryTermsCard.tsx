import { Lock, Calendar, Clock, MapPin, ShieldCheck, Info } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeliveryMethodBadge } from "@/components/seller/DeliveryMethodBadge";
import { cn } from "@/lib/utils";
import { isTrackedDelivery } from "@/lib/trust/trust-claims";
import { toTransactionDeliveryMethod } from "@/lib/delivery-methods";

export interface DeliveryTermsCardProps {
  /** Either the buyer-shape (full address columns) or the seller-shape (single address string) */
  terms: {
    delivery_method: string | null;
    expected_delivery_date?: string | null;
    verification_window_hours?: number | null;
    // buyer-shape address columns
    delivery_address_line1?: string | null;
    delivery_address_line2?: string | null;
    delivery_city?: string | null;
    delivery_state?: string | null;
    delivery_postal_code?: string | null;
    delivery_country_code?: string | null;
    // seller-shape combined address
    address?: string | null;
  } | null;
  lockedAt?: string | null;
  compact?: boolean;
  className?: string;
}

/**
 * Evidence rule per delivery method. Keys are the live `delivery_method_type`
 * enum members (courier / pickup / meetup / hand_delivery) — nothing else
 * exists in the database. The tracked-delivery case is decided by
 * `isTrackedDelivery` so this card and the trust registry can never disagree.
 */
const EVIDENCE_RULE_BY_METHOD: Record<string, string> = {
  pickup: "Handoff code required at pickup location",
  meetup: "Handoff code required at the meetup",
  hand_delivery: "Rider/courier name and dispatch evidence required",
};

function evidenceRuleFor(method: string): string {
  if (isTrackedDelivery(method)) return "Tracking number required for shipment";
  return (
    EVIDENCE_RULE_BY_METHOD[method] ??
    "No delivery evidence rule is configured for this method"
  );
}

function getAddressLine(terms: DeliveryTermsCardProps["terms"]): string | null {
  if (!terms) return null;
  if (terms.address) return terms.address;
  const parts = [
    terms.delivery_address_line1,
    terms.delivery_address_line2,
    terms.delivery_city,
    terms.delivery_state,
    terms.delivery_postal_code,
    terms.delivery_country_code,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function DeliveryTermsCard({ terms, lockedAt, compact, className }: DeliveryTermsCardProps) {
  if (!terms) return null;

  const method = terms.delivery_method ?? "unknown";
  const expected = terms.expected_delivery_date
    ? format(new Date(terms.expected_delivery_date), "MMM d, yyyy")
    : "—";
  const window = terms.verification_window_hours ?? null;
  const trackingRule = evidenceRuleFor(method);
  const address = getAddressLine(terms);
  const showHandoffNote = method === "pickup" || method === "meetup";

  return (
    <Card className={cn("rounded-2xl shadow-sm border-2 border-primary/15 overflow-hidden", className)}>
      {/* Header */}
      <div className="bg-primary/5 px-4 sm:px-5 py-3 flex items-center justify-between border-b border-primary/10">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h3 className={cn("font-bold text-foreground", compact ? "text-sm" : "text-base")}>
            {lockedAt ? "Locked Delivery Terms" : "Delivery Terms"}
          </h3>
        </div>
        {lockedAt && (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[12px] font-bold gap-1 px-2 py-0.5">
            <ShieldCheck className="h-3 w-3" />
            IMMUTABLE
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className={cn("space-y-3", compact ? "p-4" : "p-4 sm:p-5")}>
        {/* Method */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Method</span>
          {toTransactionDeliveryMethod(method) ? (
            <DeliveryMethodBadge method={method} />
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">Not recorded</span>
          )}
        </div>

        {/* Expected delivery */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Expected
          </span>
          <span className="text-sm font-semibold text-foreground">{expected}</span>
        </div>

        {/* Verification window */}
        {window !== null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Verification Window
            </span>
            <span className="text-sm font-semibold text-foreground">{window} hours after delivery</span>
          </div>
        )}

        {/* Address */}
        {address && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1">
                  {method === "pickup" ? "Pickup Location" : method === "meetup" ? "Meetup Location" : "Delivery Address"}
                </p>
                <p className="text-sm text-foreground leading-relaxed">{address}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tracking rule */}
        {!compact && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-start gap-2 bg-muted/40 rounded-lg p-3">
              <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Tracking rule:</span> {trackingRule}.
                {showHandoffNote && " Buyer will be shown a unique code to share with the seller at handoff."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {lockedAt && (
        <div className="bg-muted/30 px-4 sm:px-5 py-2.5 border-t border-border">
          <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Locked on {format(new Date(lockedAt), "MMM d, yyyy 'at' h:mm a")} — terms cannot be changed.
          </p>
        </div>
      )}
    </Card>
  );
}
