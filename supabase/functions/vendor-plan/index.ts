/**
 * vendor-plan: seller plan status + Paystack checkout for plans and sachets.
 *
 * GET  /vendor-plan            → catalogue + the caller's current plan, showcase
 *                                slot usage, boost status and purchase history.
 * POST /vendor-plan            → start a Paystack checkout for:
 *                                { purchase_type: "plan", plan_code, billing_period }
 *                                { purchase_type: "photo_slots" }   (+10 slots, ₦1,000)
 *                                { purchase_type: "store_boost" }   (7 days, ₦1,500)
 *
 * Money rules: prices are ALWAYS read server-side from `vendor_plans` (plans)
 * or the constants below (sachets). The client never supplies an amount.
 */
import { requireUser, authErrorResponse } from "../_shared/auth.ts";
import { captureVendorPlanPayment } from "../_shared/vendor-plan-capture.ts";
import { SACHETS } from "../_shared/sachet-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export { SACHETS };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Deterministic-ish, collision-safe plan payment reference. */
export function buildPlanReference(): string {
  return `SDPLAN-${crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user, adminClient } = await requireUser(req);
    const userId = user.id;

    if (req.method === "GET") {
      const [{ data: plans }, { data: profile }, { data: limit }, { data: usage }, { data: purchases }] =
        await Promise.all([
          adminClient.from("vendor_plans").select("*").eq("is_active", true).order("sort_order"),
          adminClient
            .from("profiles")
            .select("vendor_plan_code, vendor_plan_period, vendor_plan_expires_at, extra_photo_slots, featured_until")
            .eq("id", userId)
            .maybeSingle(),
          adminClient.rpc("vendor_photo_slot_limit", { _user_id: userId }),
          adminClient.rpc("vendor_photo_slot_usage", { _user_id: userId }),
          adminClient
            .from("vendor_plan_purchases")
            .select("id, purchase_type, plan_code, billing_period, amount_naira, status, paid_at, expires_at, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      const expiresAt = profile?.vendor_plan_expires_at ?? null;
      const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
      const effectiveCode = !profile?.vendor_plan_code || expired ? "verified" : profile.vendor_plan_code;
      const featuredUntil = profile?.featured_until ?? null;

      return json({
        plans: plans ?? [],
        sachets: SACHETS,
        current: {
          plan_code: effectiveCode,
          billing_period: effectiveCode === "verified" ? null : profile?.vendor_plan_period ?? null,
          expires_at: effectiveCode === "verified" ? null : expiresAt,
          extra_photo_slots: profile?.extra_photo_slots ?? 0,
          featured_until: featuredUntil && new Date(featuredUntil).getTime() > Date.now() ? featuredUntil : null,
        },
        showcase_slots: {
          limit: Number(limit ?? 5),
          used: Number(usage ?? 0),
          remaining: Math.max(0, Number(limit ?? 5) - Number(usage ?? 0)),
        },
        purchases: purchases ?? [],
      });
    }

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const body = await req.json().catch(() => ({}));

    // Return-from-Paystack fast path: verify + activate without waiting for
    // the webhook. `activate_vendor_purchase` is idempotent, so both can run.
    if (body?.action === "verify") {
      const reference = String(body?.reference ?? "");
      if (!reference) return json({ error: "reference_required" }, 400);
      const { data: owned } = await adminClient
        .from("vendor_plan_purchases")
        .select("id, user_id")
        .eq("provider_reference", reference)
        .maybeSingle();
      if (!owned || owned.user_id !== userId) return json({ error: "not_found" }, 404);

      const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!secretKey) return json({ error: "payments_unavailable" }, 503);
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      const verifyJson = await verifyRes.json().catch(() => null);
      if (!verifyJson?.status || verifyJson.data?.status !== "success") {
        return json({ status: "pending" });
      }
      const captured = await captureVendorPlanPayment(
        adminClient as any,
        reference,
        typeof verifyJson.data?.amount === "number" ? verifyJson.data.amount : null,
      );
      return json({ status: captured.ok ? "paid" : "failed", reason: captured.reason }, captured.ok ? 200 : 409);
    }

    const purchaseType = String(body?.purchase_type ?? "");
    const callbackUrl = typeof body?.callback_url === "string" ? body.callback_url : null;

    let amountNaira = 0;
    let planCode: string | null = null;
    let billingPeriod: "monthly" | "yearly" | "one_time" = "one_time";
    let metadata: Record<string, unknown> = {};
    let description = "";

    if (purchaseType === "plan") {
      planCode = String(body?.plan_code ?? "");
      const period = String(body?.billing_period ?? "monthly");
      if (period !== "monthly" && period !== "yearly") return json({ error: "invalid_billing_period" }, 400);
      billingPeriod = period;

      const { data: plan } = await adminClient
        .from("vendor_plans")
        .select("code, name, monthly_price_naira, yearly_price_naira, is_active")
        .eq("code", planCode)
        .maybeSingle();
      if (!plan || !plan.is_active) return json({ error: "unknown_plan" }, 400);
      amountNaira = Number(period === "yearly" ? plan.yearly_price_naira : plan.monthly_price_naira);
      if (!(amountNaira > 0)) return json({ error: "plan_is_free", message: "The Verified plan is free: nothing to pay." }, 400);
      description = `SafeDeal ${plan.name} plan (${period})`;
      metadata = { plan_code: plan.code, billing_period: period };
    } else if (purchaseType === "photo_slots" || purchaseType === "store_boost") {
      const sachet = SACHETS[purchaseType];
      amountNaira = sachet.amount_naira;
      description = `SafeDeal ${sachet.label}`;
      metadata = purchaseType === "photo_slots"
        ? { slots: SACHETS.photo_slots.slots }
        : { days: SACHETS.store_boost.days };
    } else {
      return json({ error: "invalid_purchase_type" }, 400);
    }

    const reference = buildPlanReference();

    const { error: insertErr } = await adminClient.from("vendor_plan_purchases").insert({
      user_id: userId,
      purchase_type: purchaseType,
      plan_code: planCode,
      billing_period: billingPeriod,
      amount_naira: amountNaira,
      currency_code: "NGN",
      provider: "paystack",
      provider_reference: reference,
      status: "pending",
      metadata,
    });
    if (insertErr) {
      console.error("[vendor-plan] purchase insert failed", insertErr);
      return json({ error: "purchase_create_failed" }, 500);
    }

    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return json({ error: "payments_unavailable" }, 503);

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: Math.round(amountNaira * 100), // kobo
        reference,
        currency: "NGN",
        callback_url: callbackUrl ?? undefined,
        metadata: { ...metadata, purchase_type: purchaseType, user_id: userId, description },
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || payload?.status !== true) {
      await adminClient
        .from("vendor_plan_purchases")
        .update({ status: "failed", metadata: { ...metadata, error: payload?.message ?? "init_failed" } })
        .eq("provider_reference", reference);
      return json({ error: "paystack_init_failed", message: payload?.message ?? "Could not start checkout" }, 502);
    }

    return json({
      reference,
      amount_naira: amountNaira,
      authorization_url: payload.data?.authorization_url,
      access_code: payload.data?.access_code,
    });
  } catch (err) {
    const authResp = authErrorResponse(err, corsHeaders);
    if (authResp) return authResp;
    console.error("[vendor-plan] unexpected", err);
    return json({ error: "internal_error" }, 500);
  }
});
