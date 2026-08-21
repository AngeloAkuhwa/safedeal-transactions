/**
 * Vendor plan / monetization API layer.
 *
 * Plans, showcase slots and sachet add-ons are ALWAYS priced and enforced
 * server-side by the `vendor-plan` edge function. Everything returned here is
 * display-only: never gate money or capacity on these values alone.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface VendorPlan {
  code: string;
  name: string;
  tagline: string | null;
  monthly_price_naira: number;
  yearly_price_naira: number;
  photo_slots: number;
  escrow_fee_rate: number;
  featured_placement: boolean;
  sort_order: number;
}

export interface ShowcaseSlots {
  limit: number;
  used: number;
  remaining: number;
}

export interface VendorPlanPurchase {
  id: string;
  purchase_type: "plan" | "photo_slots" | "store_boost";
  plan_code: string | null;
  billing_period: "monthly" | "yearly" | "one_time";
  amount_naira: number;
  status: "pending" | "paid" | "failed" | "abandoned";
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface VendorPlanState {
  plans: VendorPlan[];
  sachets: {
    photo_slots: { amount_naira: number; slots: number; label: string };
    store_boost: { amount_naira: number; days: number; label: string };
  };
  current: {
    plan_code: string;
    billing_period: "monthly" | "yearly" | null;
    expires_at: string | null;
    extra_photo_slots: number;
    featured_until: string | null;
  };
  showcase_slots: ShowcaseSlots;
  purchases: VendorPlanPurchase[];
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function getVendorPlanState(): Promise<VendorPlanState> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-plan`, {
    method: "GET",
    headers: await authHeader(),
  });
  if (!res.ok) throw new Error("Could not load your plan");
  return res.json();
}

export type PurchaseType = "plan" | "photo_slots" | "store_boost";

export interface CheckoutResult {
  reference: string;
  amount_naira: number;
  authorization_url: string;
}

export async function startPlanCheckout(input: {
  purchase_type: PurchaseType;
  plan_code?: string;
  billing_period?: "monthly" | "yearly";
  callback_url?: string;
}): Promise<CheckoutResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-plan`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? "Could not start checkout");
  return body as CheckoutResult;
}

export async function verifyPlanPayment(reference: string): Promise<{ status: string; reason?: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-plan`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ action: "verify", reference }),
  });
  const body = await res.json().catch(() => null);
  return body ?? { status: "failed" };
}

/** Display helper: plan pricing is naira, 2dp conventions. */
export function formatNaira(amount: number): string {
  return `₦${Number(amount).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/** Months free when paying yearly (marketing framing, derived not hardcoded). */
export function monthsFreeOnYearly(plan: VendorPlan): number {
  if (!plan.monthly_price_naira || !plan.yearly_price_naira) return 0;
  const months = plan.yearly_price_naira / plan.monthly_price_naira;
  return Math.max(0, Math.round(12 - months));
}

/**
 * Public plan catalogue for the marketing /pricing page (no auth required).
 * Reads the same `vendor_plans` table the edge function charges from, so the
 * page can never drift from what a seller is actually billed.
 */
export async function getPublicVendorPlans(): Promise<VendorPlan[]> {
  const { data, error } = await supabase
    .from("vendor_plans")
    .select("code, name, tagline, monthly_price_naira, yearly_price_naira, photo_slots, escrow_fee_rate, featured_placement, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VendorPlan[];
}
