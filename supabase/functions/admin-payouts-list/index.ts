import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import {
  DEFAULT_STUCK_HOURS,
  WATCHDOG_STUCK_HOURS_KEY,
  isStuckPayout,
  parseStuckHours,
  payoutAgeHours,
} from "../_shared/payout-watchdog.ts";

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

type Tab =
  | "all"
  | "pending_release"
  | "blocked"
  | "processing"
  | "completed"
  | "failed"
  | "reversed"
  | "on_hold"
  | "stuck";

function maskAccount(num?: string | null): string | null {
  if (!num) return null;
  const s = String(num);
  if (s.length < 4) return s;
  return `••••${s.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "financial_controls.view");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }

  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const admin = ctx.adminClient;

  const url = new URL(req.url);
  const tab = (url.searchParams.get("tab") ?? "pending_release") as Tab;
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const amountMin = url.searchParams.get("amount_min");
  const amountMax = url.searchParams.get("amount_max");
  const bankStatus = url.searchParams.get("bank_status"); // verified|unverified|pending
  const quick = url.searchParams.get("quick"); // failed_only|blocked_only|high_priority

  const { data: stuckSetting } = await admin
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", WATCHDOG_STUCK_HOURS_KEY)
    .eq("scope", "platform")
    .maybeSingle();
  const stuckThresholdHours = parseStuckHours((stuckSetting as any)?.setting_value ?? DEFAULT_STUCK_HOURS);
  const nowDate = new Date();

  let q = admin
    .from("payouts")
    .select(`
      id, status, amount, currency_code, release_blocked, payout_blocked_reason,
      retry_allowed, failed_attempt_count, failure_reason, provider_reference,
      released_at, created_at, initiated_at, watchdog_alerted_at,
      transaction_id, seller_id,
      transactions:transaction_id (
        id, transaction_code, money_status, status, dispute_status, needs_release_review,
        item_title:source_product_id
      ),
      profiles:seller_id (
        full_name, email, avatar_url
      )
    `, { count: "exact" });

  switch (tab) {
    case "pending_release":
      q = q.eq("status", "awaiting_release").eq("release_blocked", false);
      break;
    case "blocked":
      q = q.or("release_blocked.eq.true,status.eq.blocked");
      break;
    case "processing":
      q = q.in("status", ["pending", "processing"]);
      break;
    case "completed":
      q = q.eq("status", "completed");
      break;
    case "failed":
      q = q.eq("status", "failed");
      break;
    case "reversed":
      q = q.eq("status", "reversed");
      break;
    case "stuck":
      // Filtered below in JS using the stuck predicate
      q = q.in("status", ["pending", "processing"]).is("provider_reference", null);
      break;
    case "on_hold":
      // Filtered below in JS using needs_release_review
      break;
    case "all":
    default:
      break;
  }

  if (quick === "failed_only") q = q.eq("status", "failed");
  if (quick === "blocked_only") q = q.or("release_blocked.eq.true,status.eq.blocked");
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);
  if (amountMin) q = q.gte("amount", Number(amountMin));
  if (amountMax) q = q.lte("amount", Number(amountMax));

  q = q.order("created_at", { ascending: true }).range((page - 1) * limit, page * limit - 1);

  const { data: rows, error, count } = await q;
  if (error) return json({ error: "list_failed", detail: error.message }, 500);

  // Bulk-fetch payout accounts by seller_id
  const sellerIds = Array.from(new Set((rows ?? []).map((r: any) => r.seller_id))).filter(Boolean);
  let accountMap = new Map<string, any>();
  if (sellerIds.length > 0) {
    const { data: accounts } = await admin
      .from("v_payout_account_state")
      .select("user_id, bank_name, masked_account_number, verification_status, provider_recipient_code, account_state")
      .in("user_id", sellerIds);
    for (const a of (accounts ?? []) as any[]) accountMap.set(a.user_id, a);
  }

  // Fetch pricing snapshots for the page
  const txIds = Array.from(new Set((rows ?? []).map((r: any) => r.transaction_id))).filter(Boolean);
  let pricingMap = new Map<string, any>();
  if (txIds.length > 0) {
    const { data: prices } = await admin
      .from("transaction_pricing")
      .select("transaction_id, item_amount, platform_fee_amount, payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, currency_code")
      .in("transaction_id", txIds);
    for (const p of (prices ?? []) as any[]) pricingMap.set(p.transaction_id, p);
  }

  // Also fetch refunds-in-flight + product titles for snippets
  let refundMap = new Set<string>();
  if (txIds.length > 0) {
    const { data: refunds } = await admin
      .from("refunds")
      .select("transaction_id, status")
      .in("transaction_id", txIds)
      .in("status", ["pending", "processing"]);
    for (const r of (refunds ?? []) as any[]) refundMap.add(r.transaction_id);
  }

  const productIds = Array.from(new Set((rows ?? []).map((r: any) => r.transactions?.item_title).filter(Boolean)));
  let productMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: prods } = await admin.from("products").select("id, title").in("id", productIds);
    for (const p of (prods ?? []) as any[]) productMap.set(p.id, p.title);
  }

  // Fallback: pull first transaction_items.title per tx for rows missing a product link
  const itemTitleByTx = new Map<string, string>();
  if (txIds.length > 0) {
    const { data: items } = await admin
      .from("transaction_items")
      .select("transaction_id, title, created_at")
      .in("transaction_id", txIds)
      .order("created_at", { ascending: true });
    for (const it of (items ?? []) as any[]) {
      if (!itemTitleByTx.has(it.transaction_id)) itemTitleByTx.set(it.transaction_id, it.title);
    }
  }

  const MAX_PROTECTION_FEE = 2500;

  let mapped = (rows ?? []).map((r: any) => {
    const pricing = pricingMap.get(r.transaction_id);
    const itemTotal = Number(pricing?.item_amount ?? 0);
    const rawProtection = Number(pricing?.platform_fee_amount ?? 0);
    const protectionFee = Math.min(rawProtection, MAX_PROTECTION_FEE);
    const paymentProcessingFee = Number(pricing?.payment_processing_fee_amount ?? 0);
    const totalCharged = Number(
      pricing?.buyer_total_amount ?? itemTotal + protectionFee + paymentProcessingFee,
    );
    const sellerPayout = Number(pricing?.seller_payout_amount ?? r.amount ?? 0);
    const account = accountMap.get(r.seller_id) ?? null;
    const profile = r.profiles;
    return {
      id: r.id,
      status: r.status,
      amount: Number(r.amount ?? 0),
      currency: r.currency_code ?? "NGN",
      release_blocked: !!r.release_blocked,
      payout_blocked_reason: r.payout_blocked_reason ?? null,
      retry_allowed: !!r.retry_allowed,
      failed_attempt_count: r.failed_attempt_count ?? 0,
      failure_reason: r.failure_reason ?? null,
      provider_reference: r.provider_reference ?? null,
      entered_queue_at: r.created_at,
      released_at: r.released_at,
      initiated_at: r.initiated_at,
      is_stuck: isStuckPayout(r, stuckThresholdHours, nowDate),
      stuck_hours: Math.round(payoutAgeHours(r, nowDate) * 10) / 10,
      watchdog_alerted_at: r.watchdog_alerted_at ?? null,
      transaction: {
        id: r.transactions?.id ?? r.transaction_id,
        code: r.transactions?.transaction_code ?? "",
        money_status: r.transactions?.money_status ?? null,
        status: r.transactions?.status ?? null,
        dispute_status: r.transactions?.dispute_status ?? null,
        needs_release_review: !!r.transactions?.needs_release_review,
        item_title: (r.transactions?.item_title ? productMap.get(r.transactions.item_title) : null)
          ?? itemTitleByTx.get(r.transaction_id)
          ?? null,
        refund_in_flight: refundMap.has(r.transaction_id),
      },
      seller: {
        id: r.seller_id,
        name: profile?.full_name ?? "Seller",
        email: profile?.email ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
      payout_account: account ? {
        bank_name: account.bank_name ?? null,
        masked_account: account.masked_account_number ?? null,
        account_name: null,
        verification_status: account.verification_status ?? null,
        has_recipient_code: !!account.provider_recipient_code,
        account_state: account.account_state ?? null,
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
    };
  });

  if (tab === "stuck") {
    mapped = mapped.filter((r) => r.is_stuck);
  }

  if (tab === "on_hold") {
    mapped = mapped.filter((r) => r.transaction.needs_release_review);
  }

  if (quick === "high_priority") {
    mapped = mapped.filter((r) => r.transaction.needs_release_review || r.transaction.refund_in_flight);
  }

  if (bankStatus) {
    mapped = mapped.filter((r) => {
      const v = r.payout_account?.verification_status ?? null;
      if (bankStatus === "verified") return v === "verified";
      if (bankStatus === "unverified") return !r.payout_account || (v !== "verified" && v !== "pending");
      if (bankStatus === "pending") return v === "pending";
      return true;
    });
  }

  if (search.length > 0) {
    mapped = mapped.filter((r) =>
      r.seller.name?.toLowerCase().includes(search) ||
      r.seller.email?.toLowerCase().includes(search) ||
      r.transaction.code?.toLowerCase().includes(search) ||
      r.id.toLowerCase().includes(search) ||
      r.provider_reference?.toLowerCase().includes(search) ||
      r.payout_account?.masked_account?.toLowerCase().includes(search)
    );
  }

  return json({
    rows: mapped,
    stuck_threshold_hours: stuckThresholdHours,
    stuck_count_on_page: mapped.filter((r) => r.is_stuck).length,
    pagination: { page, limit, total: count ?? mapped.length, total_pages: Math.max(1, Math.ceil((count ?? mapped.length) / limit)) },
  });
});