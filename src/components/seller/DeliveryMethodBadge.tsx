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
    classes: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  pickup: {
    label: "Pickup",
    icon: MapPin,
    classes: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  },
  meetup: {
    label: "Meetup / Handoff",
    icon: Users,
    classes: "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  hand_delivery: {
    label: "Hand Delivery",
    icon: Hand,
    classes: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
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
