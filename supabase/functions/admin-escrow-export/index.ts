/**
 * Admin Escrow CSV Export: exports filtered escrow records as CSV.
 * Honors same filters as admin-escrow-overview (state, date_range, amount_bucket, flag, q).
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const DAY_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "escrow.export");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return new Response(JSON.stringify({ error: "auth_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = ctx.adminClient;

  const rl = await enforceAdminRateLimit(ctx, "escrow_export", 10, corsHeaders);
  if (rl) return rl;
  const url = new URL(req.url);

  const state = url.searchParams.get("state") ?? "all";
  const dateRange = url.searchParams.get("date_range") ?? "30d";
  const amountBucket = url.searchParams.get("amount_bucket") ?? "any";
  const flag = url.searchParams.get("flag") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const now = Date.now();

  const { data: states } = await admin
    .from("escrow_states")
    .select("transaction_id, state, held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at");

  const { data: pendingTx } = await admin
    .from("transactions")
    .select("id")
    .eq("money_status", "funds_releasing");
  const pendingIds = new Set((pendingTx ?? []).map((t) => t.id as string));

  let candidate = (states ?? []).filter((s) =>
    Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0) + Number(s.released_amount ?? 0) + Number(s.refunded_amount ?? 0) > 0
  );

  if (state !== "all") {
    const fns: Record<string, (s: typeof candidate[number]) => boolean> = {
      held: (s) => Number(s.held_amount ?? 0) > 0,
      frozen: (s) => Number(s.frozen_amount ?? 0) > 0,
      pending_release: (s) => pendingIds.has(s.transaction_id as string),
      released: (s) => Number(s.released_amount ?? 0) > 0,
      refunded: (s) => Number(s.refunded_amount ?? 0) > 0,
    };
    const fn = fns[state];
    if (fn) candidate = candidate.filter(fn);
  }

  const dateCutoff = dateRange === "today" ? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()
    : dateRange === "7d" ? now - 7 * DAY_MS
    : dateRange === "30d" ? now - 30 * DAY_MS
    : 0;
  if (dateCutoff > 0) {
    candidate = candidate.filter((s) => new Date(s.last_changed_at as string).getTime() >= dateCutoff);
  }

  if (amountBucket !== "any") {
    const bands: Record<string, [number, number]> = {
      "lt_100k": [0, 100_000],
      "100k_1m": [100_000, 1_000_000],
      "gt_1m": [1_000_000, Number.POSITIVE_INFINITY],
    };
    const [lo, hi] = bands[amountBucket] ?? [0, Number.POSITIVE_INFINITY];
    candidate = candidate.filter((s) => {
      const v = Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0);
      return v >= lo && v < hi;
    });
  }

  candidate = candidate.slice(0, 5000); // cap export

  const ids = candidate.map((s) => s.transaction_id as string);
  const [{ data: txs }, { data: disputes }] = await Promise.all([
    admin.from("transactions").select("id, transaction_code, created_at, money_status, transaction_status, buyer_id, seller_id").in("id", ids),
    admin.from("disputes").select("transaction_id, status").in("transaction_id", ids).neq("status", "resolved"),
  ]);
  const profileIds = new Set<string>();
  for (const t of txs ?? []) { profileIds.add(t.buyer_id as string); profileIds.add(t.seller_id as string); }
  const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", Array.from(profileIds));
  const pmap = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "Unknown"]));
  const txMap = new Map((txs ?? []).map((t) => [t.id as string, t]));
  const disputed = new Set((disputes ?? []).map((d) => d.transaction_id as string));

  const header = [
    "transaction_code", "created_at", "money_status", "transaction_status",
    "buyer", "seller", "total_held", "frozen", "releasable", "released", "refunded",
    "state", "last_changed_at", "flagged",
  ];

  const rows: string[] = [header.join(",")];
  for (const s of candidate) {
    const tx = txMap.get(s.transaction_id as string);
    if (!tx) continue;
    const buyerName = pmap.get(tx.buyer_id as string) ?? "Unknown";
    const sellerName = pmap.get(tx.seller_id as string) ?? "Unknown";
    if (q) {
      const hay = `${tx.transaction_code} ${buyerName} ${sellerName}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const totalHeld = Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0);
    if (flag === "high_value" && totalHeld < 1_000_000) continue;
    if ((flag === "disputed" || flag === "flagged") && !disputed.has(tx.id as string)) continue;

    let derived = "held";
    if (Number(s.frozen_amount) > 0) derived = "frozen";
    else if ((tx.money_status as string) === "funds_releasing") derived = "pending_release";
    else if (Number(s.released_amount) > 0 && Number(s.held_amount) === 0 && Number(s.frozen_amount) === 0) derived = "released";
    else if (Number(s.refunded_amount) > 0) derived = "refunded";

    rows.push([
      tx.transaction_code, tx.created_at, tx.money_status, tx.transaction_status,
      buyerName, sellerName,
      totalHeld, Number(s.frozen_amount ?? 0), Number(s.held_amount ?? 0),
      Number(s.released_amount ?? 0), Number(s.refunded_amount ?? 0),
      derived, s.last_changed_at, disputed.has(tx.id as string),
    ].map(csvEscape).join(","));
  }

  const filename = `safedeal-escrow-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(rows.join("\n"), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});