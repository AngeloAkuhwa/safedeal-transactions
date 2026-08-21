import { useState } from "react";
import { Lock, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DisputeDetailResponse } from "@/services/disputes.service";
import { formatMoney } from "@/lib/format";
import { PricingBreakdown } from "@/components/payment/PricingBreakdown";
import { SellerPayoutLine } from "@/components/payment/SellerPayoutLine";
import { viewFromRow } from "@/services/payment-flow.service";

interface AgreementSnapshotSectionProps {
  snapshot: DisputeDetailResponse["agreement_snapshot"];
}

const KNOWN_KEYS = [
  "item_title", "item_description", "item_condition", "condition_label",
  "buyer_name", "seller_name", "buyer_email", "seller_email",
  "item_amount", "buyer_total_amount", "seller_net_amount", "seller_payout_amount",
  "platform_fee_amount", "safedeal_fee_amount",
  "processing_fee_amount", "payment_processing_fee_amount",
  "service_fee_amount", "is_total_service_fee_capped",
  "currency_code",
  "delivery_method", "expected_delivery_date", "verification_window_hours",
  "quantity",
  "delivery_address_line1", "delivery_city", "delivery_state",
];

function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown, key?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (key && /amount|fee|price/i.test(key)) {
      return formatMoney(value, "NGN");
    }
    // Non-money numerics (e.g. quantity, hours). Render as plain integers
    // so the snapshot never emits locale-dependent thousands separators that
    // could be mistaken for money.
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function AgreementSnapshotSection({ snapshot }: AgreementSnapshotSectionProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!snapshot) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-bold text-foreground">Locked Agreement</h3>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            Locked agreement details are unavailable.
          </p>
        </CardContent>
      </Card>
    );
  }

  const json = snapshot.snapshot_json as Record<string, unknown>;

  // Extract known fields that have values
  const knownEntries = KNOWN_KEYS
    .filter((k) => json[k] !== undefined && json[k] !== null && json[k] !== "")
    .map((k) => ({ key: k, label: formatLabel(k), value: formatValue(json[k], k) }));

  // Extra fields not in known list
  const extraKeys = Object.keys(json).filter((k) => !KNOWN_KEYS.includes(k));
  const hasExtra = extraKeys.length > 0;

  // Group known entries into categories
  const itemFields = knownEntries.filter((e) =>
    ["item_title", "item_description", "item_condition", "condition_label", "quantity"].includes(e.key)
  );
  const partyFields = knownEntries.filter((e) =>
    ["buyer_name", "seller_name", "buyer_email", "seller_email"].includes(e.key)
  );
  const PRICING_KEYS = new Set([
    "item_amount", "buyer_total_amount", "seller_net_amount", "seller_payout_amount",
    "platform_fee_amount", "safedeal_fee_amount",
    "processing_fee_amount", "payment_processing_fee_amount",
    "service_fee_amount", "is_total_service_fee_capped", "currency_code",
  ]);
  const hasPricing = Object.keys(json).some((k) => PRICING_KEYS.has(k));
  const pricingView = hasPricing ? viewFromRow(json) : null;
  const deliveryFields = knownEntries.filter((e) =>
    ["delivery_method", "expected_delivery_date", "verification_window_hours", "delivery_address_line1", "delivery_city", "delivery_state"].includes(e.key)
  );

  const sections = [
    { title: "Item Details", entries: itemFields },
    { title: "Parties", entries: partyFields },
    { title: "Delivery", entries: deliveryFields },
  ].filter((s) => s.entries.length > 0);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Locked Agreement</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Locked {format(new Date(snapshot.locked_at), "MMM d, yyyy")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
          <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-foreground">
            This agreement was locked after payment and cannot be changed. It serves as the truth reference for this dispute.
          </p>
        </div>

        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {section.title}
            </p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 p-4 bg-muted/50 rounded-lg">
              {section.entries.map((entry) => (
                <div key={entry.key} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{entry.label}</p>
                  <p className="text-sm font-medium text-foreground truncate">{entry.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {pricingView ? (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Pricing
            </p>
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <PricingBreakdown snapshot={pricingView} audience="admin" />
              <div className="border-t pt-3">
                <SellerPayoutLine snapshot={pricingView} />
              </div>
            </div>
          </div>
        ) : null}

        {/* Fallback: if no known fields matched, show all as grid */}
        {sections.length === 0 && (
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 p-4 bg-muted/50 rounded-lg">
            {Object.entries(json).map(([key, value]) => (
              <div key={key} className="min-w-0">
                <p className="text-xs text-muted-foreground">{formatLabel(key)}</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {typeof value === "object" ? JSON.stringify(value) : formatValue(value, key)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Raw JSON toggle for extra fields */}
        {hasExtra && sections.length > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {showRaw ? "Hide" : "Show"} additional details ({extraKeys.length})
            </Button>
            {showRaw && (
              <div className="bg-muted rounded-lg p-4 mt-2 overflow-x-auto">
                <pre className="text-xs text-foreground whitespace-pre-wrap break-words">
                  {JSON.stringify(
                    Object.fromEntries(extraKeys.map((k) => [k, json[k]])),
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
