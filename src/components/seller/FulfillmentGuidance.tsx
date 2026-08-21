import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toTransactionDeliveryMethod,
  type TransactionDeliveryMethod,
} from "@/lib/delivery-methods";

interface FulfillmentGuidanceProps {
  method: TransactionDeliveryMethod | string | null | undefined;
}

const COPY: Record<TransactionDeliveryMethod, { before: string[]; after: string[] }> = {
  courier: {
    before: [
      "Package the item securely with appropriate cushioning.",
      "Confirm your courier (GIG, DHL, Sendbox, etc.) and obtain a tracking number.",
      "A tracking number is required before you can mark this as Dispatched.",
    ],
    after: [
      "Buyer will see live tracking details and the courier name.",
      "Funds remain in escrow until buyer confirms delivery or the verification window expires.",
      "You can upload extra dispatch evidence (e.g. courier receipt) for stronger dispute protection.",
    ],
  },
  pickup: {
    before: [
      "Prepare the item and confirm the pickup location with the buyer.",
      "When ready, mark the order as Dispatched. We'll generate a 6-digit handoff code.",
      "Share the handoff code with the buyer at pickup; do not release the item without it.",
    ],
    after: [
      "Buyer will see the pickup location and instructions to provide the handoff code.",
      "Funds remain in escrow until buyer confirms receipt or the verification window expires.",
    ],
  },
  meetup: {
    before: [
      "Agree a meetup time and safe public location with the buyer.",
      "When the meetup is scheduled, mark as Dispatched. We'll generate a 6-digit handoff code.",
      "Share the handoff code with the buyer when you meet.",
    ],
    after: [
      "Buyer will see the meetup details and the handoff code requirement.",
      "Mark as Delivered immediately after a successful handoff and upload a photo of the package as evidence.",
    ],
  },
  hand_delivery: {
    before: [
      "Identify the rider or person delivering on your behalf.",
      "Provide their name (and phone if possible) when marking as Dispatched.",
      "Buyer will be notified about the rider before arrival.",
    ],
    after: [
      "Buyer will see the rider details and expected arrival window.",
      "Funds remain in escrow until buyer confirms delivery.",
    ],
  },
};

export function FulfillmentGuidance({ method }: FulfillmentGuidanceProps) {
  const [open, setOpen] = useState(false);
  // Fail closed: a missing or unrecognised method must not be narrated as a
  // courier shipment, and must never index COPY with a non-member key.
  const key = toTransactionDeliveryMethod(method);
  if (!key) return null;
  const copy = COPY[key];

  return (
    <div className="border border-border rounded-xl bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Lightbulb className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Fulfillment guidance</p>
          <p className="text-xs text-muted-foreground">What to do before and after dispatch</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before dispatch</p>
            <ul className="space-y-1.5">
              {copy.before.map((line, i) => (
                <li key={i} className="text-xs text-foreground/80 flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">After dispatch</p>
            <ul className="space-y-1.5">
              {copy.after.map((line, i) => (
                <li key={i} className="text-xs text-foreground/80 flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
