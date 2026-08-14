/**
 * Vendor plan / sachet payment capture.
 *
 * Plan purchases ride the SAME Paystack account and webhook as escrow
 * payments, so they are distinguished purely by their reference prefix.
 * Escrow references never use this prefix.
 *
 * Capture rules:
 *  - amount charged must match the purchase row recorded at checkout
 *    (server-priced; the client never supplies an amount)
 *  - activation is delegated to `activate_vendor_purchase`, which is
 *    idempotent, so a webhook + verify race applies the plan once.
 */
export const VENDOR_PLAN_REFERENCE_PREFIX = "SDPLAN-";

export function isVendorPlanReference(reference: string | null | undefined): boolean {
  return typeof reference === "string" && reference.startsWith(VENDOR_PLAN_REFERENCE_PREFIX);
}

export interface VendorPlanCaptureResult {
  ok: boolean;
  reason: string;
  purchase_id?: string;
  already_applied?: boolean;
}

interface MinimalClient {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

export async function captureVendorPlanPayment(
  client: MinimalClient,
  reference: string,
  paidAmountKobo: number | null,
): Promise<VendorPlanCaptureResult> {
  const { data: purchase } = await client
    .from("vendor_plan_purchases")
    .select("id, amount_naira, status")
    .eq("provider_reference", reference)
    .maybeSingle();

  if (!purchase) return { ok: false, reason: "purchase_not_found" };
  if (purchase.status === "paid") return { ok: true, reason: "already_applied", already_applied: true, purchase_id: purchase.id };

  const expectedKobo = Math.round(Number(purchase.amount_naira) * 100);
  if (paidAmountKobo != null && paidAmountKobo !== expectedKobo) {
    await client
      .from("vendor_plan_purchases")
      .update({ status: "failed", metadata: { amount_mismatch: { expected_kobo: expectedKobo, paid_kobo: paidAmountKobo } } })
      .eq("id", purchase.id);
    return { ok: false, reason: "amount_mismatch" };
  }

  const { data, error } = await client.rpc("activate_vendor_purchase", { _provider_reference: reference });
  if (error) return { ok: false, reason: "activation_failed" };
  const result = (data ?? {}) as { ok?: boolean; already_applied?: boolean };
  return {
    ok: Boolean(result.ok),
    reason: result.ok ? "activated" : "activation_rejected",
    already_applied: Boolean(result.already_applied),
    purchase_id: purchase.id,
  };
}
