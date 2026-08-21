import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Period = "30d" | "90d" | "all";
type Bucket = "daily" | "weekly" | "monthly";

interface AnalyticsRequest {
  period?: Period;
  bucket?: Bucket;
  product_id?: string | null;
  currency?: string;
}

const FUNDED_OR_LATER = [
  "funds_held_in_escrow",
  "funds_frozen",
  "funds_pending_release",
  "funds_releasing",
  "funds_released",
  "refund_pending",
  "refund_issued",
] as const;

const PAID_STATUSES = [
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
  "completed",
  "disputed",
  "resolved",
  "refunded",
] as const;

const ACTIVE_STATUSES = [
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function periodStart(period: Period): Date | null {
  if (period === "all") return null;
  const days = period === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function bucketKey(date: Date, bucket: Bucket): string {
  const d = new Date(date);
  if (bucket === "daily") return d.toISOString().slice(0, 10);
  if (bucket === "monthly") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  // weekly: ISO week start (Monday)
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function bucketRange(key: string, bucket: Bucket): { start: string; end: string; label: string } {
  if (bucket === "monthly") {
    const [y, m] = key.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10),
      label: start.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) };
  }
  const start = new Date(`${key}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (bucket === "daily" ? 0 : 6));
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: bucket === "daily" ? fmt(start) : `${fmt(start)} – ${fmt(end)}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Not authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let userId: string;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!payload?.sub || (payload.exp && payload.exp * 1000 < Date.now())) {
        return jsonResponse({ error: "Invalid session" }, 401);
      }
      userId = payload.sub as string;
    } catch {
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    const { data: hasRole, error: roleErr } = await admin.rpc("has_role", { _user_id: userId, _role: "seller" });
    if (roleErr || !hasRole) return jsonResponse({ error: "Seller role required" }, 403);

    let body: AnalyticsRequest = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const period: Period = (body.period === "30d" || body.period === "all") ? body.period : "90d";
    const bucket: Bucket = (body.bucket === "daily" || body.bucket === "monthly") ? body.bucket : "weekly";
    const productId = body.product_id ?? null;
    const currency = body.currency || "NGN";
    const sinceDate = periodStart(period);
    const sinceIso = sinceDate?.toISOString() ?? null;

    // 1. Pull all relevant transactions for this seller in window (broad. Single fetch)
    let txQuery = admin
      .from("transactions")
      .select(
        "id,status,money_status,buyer_confirmed_at,seller_confirmed_at,release_completed_at,delivered_at,created_at,completed_at,source_product_id," +
          "transaction_pricing(seller_payout_amount,buyer_total_amount,platform_fee_amount,payment_processing_fee_amount,currency_code)"
      )
      .eq("seller_id", userId)
      .limit(5000);
    if (sinceIso) txQuery = txQuery.gte("created_at", sinceIso);
    if (productId) txQuery = txQuery.eq("source_product_id", productId);

    const { data: txs, error: txErr } = await txQuery;
    if (txErr) {
      console.error("seller-analytics tx fetch error", txErr);
      return jsonResponse({ error: "Failed to load analytics" }, 500);
    }
    const txRows = txs ?? [];

    // ---------- D1.1 Summary ----------
    let seller_net_released = 0;
    let funds_awaiting_release = 0;
    let funds_held_in_escrow = 0;
    let gross_sales = 0;
    let fees_deducted = 0;
    let disputed_amount = 0;
    let completed_count = 0;
    let active_count = 0;

    for (const t of txRows) {
      const p = (t as any).transaction_pricing;
      const net = num(p?.seller_payout_amount);
      const gross = num(p?.buyer_total_amount);
      const fees = num(p?.platform_fee_amount) + num(p?.payment_processing_fee_amount);
      const ms = t.money_status as string;

      if (ms === "funds_released") seller_net_released += net;
      if (ms === "funds_pending_release") funds_awaiting_release += net;
      if (ms === "funds_held_in_escrow") funds_held_in_escrow += net;
      if (ms === "funds_frozen") disputed_amount += net;
      if ((FUNDED_OR_LATER as readonly string[]).includes(ms)) {
        gross_sales += gross;
        fees_deducted += fees;
      }
      if (t.status === "completed") completed_count += 1;
      if ((ACTIVE_STATUSES as readonly string[]).includes(t.status as string)) active_count += 1;
    }

    // Open disputes & failed payouts (window-scoped). Independent fetches
    const { data: openDisputes } = await admin
      .from("disputes")
      .select("id,transaction_id,status,opened_at,resolved_at,reason," +
        "transactions!inner(seller_id)")
      .eq("transactions.seller_id", userId)
      .gte(sinceIso ? "opened_at" : "id", sinceIso ?? "00000000-0000-0000-0000-000000000000")
      .limit(2000);
    const disputesRows = openDisputes ?? [];
    const open_disputes_count = disputesRows.filter((d: any) =>
      ["open", "seller_response_pending", "under_review"].includes(d.status)).length;
    const resolved_disputes_count = disputesRows.filter((d: any) => d.status === "resolved").length;

    // Add disputed_amount from transactions linked to open disputes (dedup with funds_frozen)
    const frozenIds = new Set(txRows.filter(t => t.money_status === "funds_frozen").map(t => t.id));
    for (const d of disputesRows as any[]) {
      if (!["open","seller_response_pending","under_review"].includes(d.status)) continue;
      if (frozenIds.has(d.transaction_id)) continue;
      const t = txRows.find(x => x.id === d.transaction_id);
      if (t) disputed_amount += num((t as any).transaction_pricing?.seller_payout_amount);
    }

    const { count: failed_payouts_count } = await admin
      .from("payouts")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "failed");

    const summary = {
      currency,
      seller_net_released,
      funds_awaiting_release,
      funds_held_in_escrow,
      gross_sales,
      fees_deducted,
      disputed_amount,
      completed_transactions_count: completed_count,
      active_transactions_count: active_count,
      open_disputes_count,
      failed_payouts_count: failed_payouts_count ?? 0,
    };

    // ---------- D1.2 Revenue trend (released only) ----------
    type Bucketed = { label: string; start_date: string; end_date: string;
      seller_net_released: number; gross_sales: number; fees_deducted: number; completed_transactions: number };
    const buckets = new Map<string, Bucketed>();
    for (const t of txRows) {
      if (t.money_status !== "funds_released" || !t.release_completed_at) continue;
      const k = bucketKey(new Date(t.release_completed_at), bucket);
      let b = buckets.get(k);
      if (!b) {
        const r = bucketRange(k, bucket);
        b = { ...r, seller_net_released: 0, gross_sales: 0, fees_deducted: 0, completed_transactions: 0 };
        buckets.set(k, b);
      }
      const p = (t as any).transaction_pricing;
      b.seller_net_released += num(p?.seller_payout_amount);
      b.gross_sales += num(p?.buyer_total_amount);
      b.fees_deducted += num(p?.platform_fee_amount) + num(p?.payment_processing_fee_amount);
      b.completed_transactions += 1;
    }
    const trendData = [...buckets.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));

    const revenue_trend = {
      period, bucket, currency,
      total_released_net: trendData.reduce((s, b) => s + b.seller_net_released, 0),
      data: trendData,
    };

    // ---------- D1.3 Top products ----------
    const productAgg = new Map<string, { completed: number; gross: number; net: number }>();
    for (const t of txRows) {
      if (!t.source_product_id) continue;
      const ms = t.money_status as string;
      if (!["funds_released","funds_pending_release","funds_releasing"].includes(ms)) continue;
      const a = productAgg.get(t.source_product_id) ?? { completed: 0, gross: 0, net: 0 };
      const p = (t as any).transaction_pricing;
      a.completed += 1;
      a.gross += num(p?.buyer_total_amount);
      a.net += num(p?.seller_payout_amount);
      productAgg.set(t.source_product_id, a);
    }
    const topIds = [...productAgg.entries()]
      .sort((a, b) => b[1].completed - a[1].completed)
      .slice(0, 3)
      .map(([id]) => id);

    let top_products: Array<Record<string, unknown>> = [];
    if (topIds.length) {
      const { data: prodRows } = await admin
        .from("products")
        .select("id,title,stock_quantity,reserved_quantity," +
          "product_media(is_primary,sort_order,files(secure_url,file_url))")
        .in("id", topIds)
        .eq("seller_id", userId);
      top_products = topIds.map(id => {
        const p = (prodRows ?? []).find((x: any) => x.id === id) as any;
        const a = productAgg.get(id)!;
        const media = (p?.product_media ?? []) as any[];
        const primary = media.find(m => m.is_primary)
          ?? [...media].sort((x,y) => (x.sort_order??0) - (y.sort_order??0))[0];
        const f = primary?.files;
        const image_url = f?.secure_url ?? f?.file_url ?? null;
        return {
          product_id: id,
          name: p?.title ?? "Product",
          image_url,
          completed_transactions: a.completed,
          gross_sales: a.gross,
          seller_net_released: a.net,
          current_stock: Math.max(0, (p?.stock_quantity ?? 0) - (p?.reserved_quantity ?? 0)),
          rating: null,
        };
      });
    }

    // ---------- D1.4 Completion rate ----------
    const paid_count = txRows.filter(t => (PAID_STATUSES as readonly string[]).includes(t.status as string)).length;
    const completion_rate = {
      value: paid_count > 0 ? Number(((completed_count / paid_count) * 100).toFixed(1)) : null,
      completed_count,
      paid_transaction_count: paid_count,
    };

    // ---------- D1.5 Dispute rate + outcome split ----------
    const total_disputes = disputesRows.length;
    const disputeIds = disputesRows.map((d: any) => d.id);
    let outcome_split = { resolved_for_buyer: 0, resolved_for_seller: 0, partial_refund: 0, dismissed: 0 };
    if (disputeIds.length) {
      const { data: outcomes } = await admin
        .from("dispute_outcomes")
        .select("outcome_type")
        .in("dispute_id", disputeIds);
      for (const o of outcomes ?? []) {
        const k = (o as any).outcome_type as string;
        if (k in outcome_split) (outcome_split as any)[k] += 1;
      }
    }
    const dispute_rate = {
      value: paid_count > 0 ? Number(((total_disputes / paid_count) * 100).toFixed(1)) : null,
      open_disputes: open_disputes_count,
      resolved_disputes: resolved_disputes_count,
      total_disputes,
      outcome_split,
    };

    // ---------- D1.6 Average release time ----------
    const releaseHours: number[] = [];
    for (const t of txRows) {
      if (t.money_status !== "funds_released" || !t.release_completed_at || !t.buyer_confirmed_at) continue;
      const ms = new Date(t.release_completed_at).getTime() - new Date(t.buyer_confirmed_at).getTime();
      if (ms > 0) releaseHours.push(ms / 3_600_000);
    }
    const avg = releaseHours.length ? releaseHours.reduce((a, b) => a + b, 0) / releaseHours.length : null;
    const average_release_time = releaseHours.length < 3
      ? { hours: null, sample_size: releaseHours.length, label: "Not enough data yet" }
      : { hours: Number(avg!.toFixed(1)), sample_size: releaseHours.length, label: `${avg!.toFixed(1)} hours` };

    // ---------- D1.7 Trust metrics ----------
    const { data: lifetimeCompleted } = await admin
      .from("transactions").select("id", { count: "exact", head: true } as any)
      .eq("seller_id", userId).eq("status", "completed");
    const { count: completedDealsLife } = await admin
      .from("transactions").select("id", { count: "exact", head: true })
      .eq("seller_id", userId).eq("status", "completed");
    const { count: lifetimeDisputes } = await admin
      .from("disputes")
      .select("id,transactions!inner(seller_id)", { count: "exact", head: true })
      .eq("transactions.seller_id", userId);
    const { data: verif } = await admin
      .from("account_verifications")
      .select("identity_verified,payout_verified")
      .eq("user_id", userId).maybeSingle();

    const cd = completedDealsLife ?? 0;
    const ld = lifetimeDisputes ?? 0;
    const dispute_free_rate = cd > 0 ? Math.max(0, 1 - ld / cd) : 0;

    const trust_metrics = {
      seller_rating: null,
      completed_deals: cd,
      on_time_dispatch_rate: null,
      dispute_free_rate: Number(dispute_free_rate.toFixed(3)),
      response_time_hours: null,
      identity_verified: !!verif?.identity_verified,
      payout_verified: !!verif?.payout_verified,
    };

    return jsonResponse({
      summary,
      revenue_trend,
      top_products,
      completion_rate,
      dispute_rate,
      average_release_time,
      trust_metrics,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("seller-analytics fatal", e);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
