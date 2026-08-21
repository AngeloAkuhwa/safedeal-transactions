/**
 * Showcase slots: the vendor-plan limit on how many product photos a seller
 * can have live at once. NEVER call these "storage": a slot is a showcase
 * position, and the language must stay commercial ("Showcase up to N products").
 *
 * Server-side enforcement is authoritative; the seller UI only displays what
 * this module reports.
 */
import { SACHETS } from "./sachet-catalog.ts";
export interface SlotState {
  limit: number;
  used: number;
  remaining: number;
}

interface MinimalClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

export async function loadSlotState(client: MinimalClient, userId: string): Promise<SlotState> {
  const [{ data: limit }, { data: used }] = await Promise.all([
    client.rpc("vendor_photo_slot_limit", { _user_id: userId }),
    client.rpc("vendor_photo_slot_usage", { _user_id: userId }),
  ]);
  const lim = Number(limit ?? 5);
  const usd = Number(used ?? 0);
  return { limit: lim, used: usd, remaining: Math.max(0, lim - usd) };
}

export function slotLimitMessage(limit: number): string {
  // Add-on price is read from the sachet catalogue that actually charges it —
  // never restated here.
  const sachet = SACHETS.photo_slots;
  const price = `₦${sachet.amount_naira.toLocaleString("en-NG")}`;
  return `You've used all ${limit} showcase slots on your current plan. Upgrade your plan to showcase more products, or add +${sachet.slots} slots for ${price}.`;
}

/**
 * Check whether `incoming` new product images fit inside the vendor's plan.
 * `replacingImages` is the number of images already counted for the product
 * being edited (they are freed by the edit).
 */
export async function checkShowcaseCapacity(
  client: MinimalClient,
  userId: string,
  incomingImages: number,
  replacingImages = 0,
): Promise<{ allowed: boolean; state: SlotState; message?: string }> {
  const state = await loadSlotState(client, userId);
  const effectiveUsed = Math.max(0, state.used - replacingImages);
  if (effectiveUsed + incomingImages <= state.limit) return { allowed: true, state };
  return { allowed: false, state, message: slotLimitMessage(state.limit) };
}
