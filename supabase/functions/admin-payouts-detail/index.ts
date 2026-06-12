import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function maskAccount(num?: string | null): string | null {
  if (!num) return null;
  const s = String(num);
  if (s.length < 4) return s;
  return `••••${s.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }
  const admin = ctx.adminClient;

  const url = new URL(req.url);
  const payoutId = url.searchParams.get("payout_id");
  if (!payoutId) return json({ error: "payout_id_required" }, 400);

  const { data: payout, error: pErr } = await admin
    .from("payouts")
    .select("*")
    .eq("id", payoutId)
    .maybeSingle();
  if (pErr) return json({ error: "payout_fetch_failed", detail: pErr.message }, 500);
  if (!payout) return json({ error: "not_found" }, 404);

  const [{ data: tx }, { data: pricing }, { data: account }, { data: profile }, { data: queue }, { data: notes }, { data: events }, { data: dispute }, { data: investigation }, { data: refunds }, { data: payment }] = await Promise.all([
    admin.from("transactions").select("id, transaction_code, status, money_status, dispute_status, needs_release_review, needs_admin_review, source_product_id, buyer_id, seller_id, created_at").eq("id", payout.transaction_id).maybeSingle(),
    admin.from("transaction_pricing").select("item_amount, platform_fee_amount, processing_fee_amount, total_amount, currency_code").eq("transaction_id", payout.transaction_id).maybeSingle(),
    admin.from("payout_accounts").select("*").eq("user_id", payout.seller_id).maybeSingle(),
    admin.from("profiles").select("id, full_name, email, avatar_url").eq("id", payout.seller_id).maybeSingle(),
    admin.from("release_review_queue").select("id, queue_type, status, notes, entered_queue_at, resolved_at").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }),
    admin.from("admin_transaction_notes").select("id, note, created_at, admin_user_id").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }).limit(20),
    admin.from("transaction_events").select("id, event_type, event_data, actor_role, created_at").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }).limit(60),
    admin.from("disputes").select("id, status, opened_at, resolved_at").eq("transaction_id", payout.transaction_id).order("opened_at", { ascending: false }).maybeSingle(),
    admin.from("admin_investigations").select("id, status, priority").eq("transaction_id", payout.transaction_id).maybeSingle(),
    admin.from("refunds").select("id, status, refund_amount, created_at").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }),
    admin.from("payments").select("id, status, amount, provider_reference, paid_at").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const productTitle = (() => { return null; })();
  let itemTitle: string | null = null;
  if (tx?.source_product_id) {
    const { data: prod } = await admin.from("products").select("title").eq("id", tx.source_product_id).maybeSingle();
    itemTitle = prod?.title ?? null;
  }

  const MAX_PROTECTION_FEE = 2500;
  const itemTotal = Number(pricing?.item_amount ?? 0);
  const rawProtection = Number(pricing?.platform_fee_amount ?? 0);
  const protectionFee = Math.min(rawProtection, MAX_PROTECTION_FEE);
  const paymentProcessingFee = Number(pricing?.processing_fee_amount ?? 0);
  const totalCharged = itemTotal + protectionFee + paymentProcessingFee;
  const sellerPayout = Math.max(itemTotal - protectionFee, Number(payout.amount ?? 0));

  const investigationOpen = investigation && ["open","under_review","escalated"].includes(investigation.status);
  const refundInFlight = (refunds ?? []).some((r: any) => ["pending","processing"].includes(r.status));
  const openQueue = (queue ?? []).find((q: any) => ["pending","claimed","processing"].includes(q.status));

  const gates = [
    { key: "money_pending_release", label: "Transaction money status is funds_pending_release", pass: tx?.money_status === "funds_pending_release" },
    { key: "dispute_clear", label: "No active dispute", pass: !tx?.dispute_status || tx?.dispute_status === "resolved" },
    { key: "no_investigation", label: "No open investigation", pass: !investigationOpen && !tx?.needs_admin_review },
    { key: "payout_awaiting", label: "Payout status is awaiting_release", pass: payout.status === "awaiting_release" },
    { key: "not_blocked", label: "Payout is not blocked", pass: !payout.release_blocked },
    { key: "account_verified", label: "Seller payout account is verified", pass: account?.verification_status === "verified" },
    { key: "recipient_code", label: "Provider recipient code exists", pass: !!account?.provider_recipient_code },
    { key: "queue_open", label: "Release review queue is pending/claimed", pass: !!openQueue },
    { key: "no_refund", label: "No in-flight refund", pass: !refundInFlight },
  ];
  const eligible = gates.every((g) => g.pass);

  return json({
    payout: {
      id: payout.id,
      status: payout.status,
      amount: Number(payout.amount ?? 0),
      currency: payout.currency_code ?? "NGN",
      release_blocked: !!payout.release_blocked,
      payout_blocked_reason: payout.payout_blocked_reason ?? null,
      retry_allowed: !!payout.retry_allowed,
      failed_attempt_count: payout.failed_attempt_count ?? 0,
      failure_reason: payout.failure_reason ?? null,
      provider_reference: payout.provider_reference ?? null,
      entered_queue_at: payout.created_at,
      released_at: payout.released_at,
      initiated_at: payout.initiated_at,
      notes: payout.notes ?? null,
    },
    transaction: tx ? {
      id: tx.id,
      code: tx.transaction_code,
      status: tx.status,
      money_status: tx.money_status,
      dispute_status: tx.dispute_status,
      needs_release_review: !!tx.needs_release_review,
      needs_admin_review: !!tx.needs_admin_review,
      buyer_id: tx.buyer_id,
      seller_id: tx.seller_id,
      item_title: itemTitle,
      created_at: tx.created_at,
    } : null,
    pricing: {
      item_total: itemTotal,
      protection_fee: protectionFee,
      protection_fee_raw: rawProtection,
      protection_fee_capped: rawProtection > MAX_PROTECTION_FEE,
      payment_processing_fee: paymentProcessingFee,
      total_charged: totalCharged,
      seller_payout: sellerPayout,
      currency: pricing?.currency_code ?? "NGN",
    },
    seller: profile ? {
      id: profile.id, name: profile.full_name, email: profile.email, avatar_url: profile.avatar_url,
    } : null,
    payout_account: account ? {
      bank_name: account.bank_name,
      masked_account: maskAccount(account.account_number),
      account_name: account.account_name,
      verification_status: account.verification_status,
      has_recipient_code: !!account.provider_recipient_code,
      last_verified_at: account.verified_at ?? null,
    } : null,
    payment: payment ?? null,
    refunds: refunds ?? [],
    dispute: dispute ?? null,
    investigation: investigation ?? null,
    queue: queue ?? [],
    notes: notes ?? [],
    events: events ?? [],
    eligibility: { gates, eligible },
  });
});