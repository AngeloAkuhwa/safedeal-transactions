import { Truck, MapPin, Users, Hand } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  toTransactionDeliveryMethod,
  type TransactionDeliveryMethod,
} from "@/lib/delivery-methods";

export type DeliveryMethod = TransactionDeliveryMethod;

interface DeliveryMethodBadgeProps {
  method: DeliveryMethod | string | null | undefined;
  className?: string;
}

const META: Record<DeliveryMethod, { label: string; icon: typeof Truck; classes: string }> = {
  courier: {
    label: "Courier Shipment",
    icon: Truck,
    classes: "border-border bg-muted text-foreground",
  },
  pickup: {
    label: "Pickup",
    icon: MapPin,
    classes: "border-border bg-muted text-foreground",
  },
  meetup: {
    label: "Meetup / Handoff",
    icon: Users,
    classes: "border-border bg-muted text-foreground",
  },
  hand_delivery: {
    label: "Hand Delivery",
    icon: Hand,
    classes: "border-border bg-muted text-foreground",
  },
};

/**
 * Fails closed: a missing or unrecognised method renders nothing rather than
 * asserting "Courier Shipment" for a delivery arrangement we cannot identify.
 */
export function DeliveryMethodBadge({ method, className }: DeliveryMethodBadgeProps) {
  const key = toTransactionDeliveryMethod(method);
  if (!key) return null;
  const meta = META[key];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-1 rounded-full font-medium", meta.classes, className)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs">{meta.label}</span>
    </Badge>
  );
}
