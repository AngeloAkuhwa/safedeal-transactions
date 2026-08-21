import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function csvResponse(body: string, filename: string) {
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
function errResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

const ACTIVE_STATUSES = ["open", "seller_response_pending", "under_review"] as const;
const REASON_LABELS: Record<string, string> = {
  wrong_item_received: "Wrong Item",
  damaged_item_received: "Damaged",
  incomplete_order: "Item Condition",
  item_not_as_described: "Not as Described",
  item_not_delivered: "Not Delivered",
  suspected_fake_item: "Item Condition",
  other: "Other",
};

interface QueueParams {
  quick?: string;
  q?: string;
  reason?: string;
  agent?: string;
  amount_bucket?: string;
  date_from?: string;
  date_to?: string;
  priority?: string;
  money_status?: string;
  evidence_status?: string;
  sla_state?: string;
  page?: number;
  page_size?: number;
  sort?: string;
  format?: string;
}

function parseParams(req: Request): QueueParams {
  const url = new URL(req.url);
  const p = url.searchParams;
  const params: QueueParams = {};
  for (const k of [
    "quick","q","reason","agent","amount_bucket","date_from","date_to",
    "priority","money_status","evidence_status","sla_state","sort","format",
  ]) {
    const v = p.get(k);
    if (v) (params as Record<string, unknown>)[k] = v;
  }
  const pg = p.get("page"); if (pg) params.page = Math.max(1, Number(pg) || 1);
  const ps = p.get("page_size"); if (ps) params.page_size = Math.max(1, Math.min(100, Number(ps) || 25));
  return params;
}

function lagosTodayStartIso(): string {
  // Africa/Lagos is UTC+1 (no DST). Take "now" → shift to Lagos → midnight → back to UTC.
  const now = new Date();
  const lagosMs = now.getTime() + 60 * 60 * 1000;
  const lagos = new Date(lagosMs);
  const midnightLagos = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate(), 0, 0, 0);
  return new Date(midnightLagos - 60 * 60 * 1000).toISOString();
}

function priorityFor(row: {
  status: string;
  seller_response_due_at: string | null;
  resolution_due_at?: string | null;
  opened_at: string;
  resolved_at: string | null;
}): "overdue" | "high" | "medium" | "low" | "resolved" {
  if (row.status === "resolved") return "resolved";
  const now = Date.now();
  const due = [row.seller_response_due_at, row.resolution_due_at]
    .filter(Boolean)
    .map((s) => new Date(s as string).getTime());
  const minDue = due.length ? Math.min(...due) : Infinity;
  if (minDue < now) return "overdue";
  const ageH = (now - new Date(row.opened_at).getTime()) / 3_600_000;
  if (minDue - now < 24 * 3_600_000 || ageH > 72) return "high";
  if (ageH > 24) return "medium";
  return "low";
}

function slaFor(row: {
  status: string;
  seller_response_due_at: string | null;
  resolution_due_at?: string | null;
  resolved_at: string | null;
}) {
  const now = Date.now();
  if (row.status === "resolved" && row.resolved_at) {
    return {
      due_at_iso: null,
      overdue_by_minutes: null,
      due_in_minutes: null,
      resolved_at_iso: row.resolved_at,
    };
  }
  const due = [row.seller_response_due_at, row.resolution_due_at]
    .filter(Boolean)
    .map((s) => new Date(s as string).getTime());
  if (!due.length) {
    return { due_at_iso: null, overdue_by_minutes: null, due_in_minutes: null, resolved_at_iso: null };
  }
  const next = Math.min(...due);
  const diffMin = Math.round((next - now) / 60000);
  return {
    due_at_iso: new Date(next).toISOString(),
    overdue_by_minutes: diffMin < 0 ? -diffMin : null,
    due_in_minutes: diffMin >= 0 ? diffMin : null,
    resolved_at_iso: null,
  };
}

async function buildPayload(adminClient: ReturnType<typeof createClient>, params: QueueParams) {
  // ---------- KPI counts ----------
  const todayStart = lagosTodayStartIso();
  const [openRes, awaitRes, underRes, resolvedTodayRes, openYesterdayRes, resolvedTotalRes, allTotalRes] = await Promise.all([
    adminClient.from("disputes").select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES as unknown as string[]),
    adminClient.from("disputes").select("id", { count: "exact", head: true })
      .eq("status", "seller_response_pending"),
    adminClient.from("disputes").select("id", { count: "exact", head: true })
      .eq("status", "under_review"),
    adminClient.from("disputes").select("id", { count: "exact", head: true })
      .eq("status", "resolved").gte("resolved_at", todayStart),
    adminClient.from("disputes").select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .lt("opened_at", todayStart),
    adminClient.from("disputes").select("id", { count: "exact", head: true })
      .eq("status", "resolved"),
    adminClient.from("disputes").select("id", { count: "exact", head: true }),
  ]);
  // Overdue active disputes
  const overdueRes = await adminClient
    .from("disputes")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_STATUSES as unknown as string[])
    .lt("seller_response_due_at", new Date().toISOString());

  const open_disputes = openRes.count ?? 0;
  const awaiting_seller = awaitRes.count ?? 0;
  const under_review = underRes.count ?? 0;
  const overdue = overdueRes.count ?? 0;
  const resolved_today = resolvedTodayRes.count ?? 0;
  const escalated = 0; // schema has no escalated/priority: surfaced as 0

  const kpis = {
    open_disputes,
    awaiting_seller,
    under_review,
    overdue,
    resolved_today,
    escalated,
    resolved_total: resolvedTotalRes.count ?? 0,
    all_total: allTotalRes.count ?? 0,
    deltas: {
      open_vs_yesterday: open_disputes - (openYesterdayRes.count ?? 0),
      resolved_vs_target: resolved_today,
    },
  };

  // ---------- Rows ----------
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = adminClient
    .from("disputes")
    .select(
      `id, transaction_id, status, reason, opened_at, resolved_at, seller_response_due_at, opened_by_user_id,
       transactions:transaction_id (
        id, transaction_code, money_status,
        buyer_id, seller_id,
        buyer:profiles!transactions_buyer_id_fkey (id, full_name, avatar_url),
        seller:profiles!transactions_seller_id_fkey (id, full_name, avatar_url)
      ),
       outcome:dispute_outcomes!dispute_outcomes_dispute_id_fkey (
         outcome_type, refund_amount, release_amount
       )`,
      { count: "exact" },
    );

  // Quick filter
  switch (params.quick) {
    case "overdue":
      q = q.in("status", ACTIVE_STATUSES as unknown as string[])
        .lt("seller_response_due_at", new Date().toISOString());
      break;
    case "open":
      q = q.in("status", ACTIVE_STATUSES as unknown as string[]);
      break;
    case "awaiting_seller":
      q = q.eq("status", "seller_response_pending"); break;
    case "under_review":
      q = q.eq("status", "under_review"); break;
    case "escalated":
      // No escalation flag in current schema. Return empty set without enum cast errors.
      q = q.eq("id", "00000000-0000-0000-0000-000000000000");
      break;
    case "resolved":
      q = q.eq("status", "resolved"); break;
    case "all":
    default:
      break;
  }
  if (params.reason) q = q.eq("reason", params.reason);
  if (params.date_from) q = q.gte("opened_at", params.date_from);
  if (params.date_to) q = q.lte("opened_at", params.date_to);

  q = q.order("opened_at", { ascending: false }).range(from, to);

  const { data: rowsRaw, count, error } = await q;
  if (error) throw error;

  type Raw = {
    id: string; transaction_id: string; status: string; reason: string;
    opened_at: string; resolved_at: string | null; seller_response_due_at: string | null;
    transactions: {
      id: string; transaction_code: string; money_status: string | null;
      buyer: { id: string; full_name: string | null; avatar_url: string | null } | null;
      seller: { id: string; full_name: string | null; avatar_url: string | null } | null;
    } | null;
    outcome: { outcome_type: string; refund_amount: number | null; release_amount: number | null }[] | null;
  };

  // ---------- Batch-fetch pricing and items by transaction_id ----------
  const rawRows = (rowsRaw ?? []) as unknown as Raw[];
  const txIds = Array.from(new Set(rawRows.map((r) => r.transaction_id).filter(Boolean)));
  const pricingMap = new Map<string, { buyer_total_amount: number | null; item_amount: number | null; platform_fee_amount: number | null; payment_processing_fee_amount: number | null; currency_code: string | null }>();
  const itemsMap = new Map<string, { title: string | null }>();
  if (txIds.length) {
    const [pricingRes, itemsRes] = await Promise.all([
      adminClient.from("transaction_pricing")
        .select("transaction_id, buyer_total_amount, item_amount, platform_fee_amount, payment_processing_fee_amount, currency_code")
        .in("transaction_id", txIds),
      adminClient.from("transaction_items")
        .select("transaction_id, title")
        .in("transaction_id", txIds),
    ]);
    for (const p of (pricingRes.data ?? []) as Array<{ transaction_id: string; buyer_total_amount: number | null; item_amount: number | null; platform_fee_amount: number | null; payment_processing_fee_amount: number | null; currency_code: string | null }>) {
      if (!pricingMap.has(p.transaction_id)) pricingMap.set(p.transaction_id, p);
    }
    for (const i of (itemsRes.data ?? []) as Array<{ transaction_id: string; title: string | null }>) {
      if (!itemsMap.has(i.transaction_id)) itemsMap.set(i.transaction_id, i);
    }
  }

  let rows = rawRows.map((r) => {
    const tx = r.transactions;
    const outcome = (r.outcome && r.outcome[0]) || null;
    const pricing = pricingMap.get(r.transaction_id) || null;
    const firstItem = itemsMap.get(r.transaction_id) || null;
    // Amount fallback chain: buyer_total_amount → sum of components → 0
    let amountNum = Number(pricing?.buyer_total_amount ?? 0);
    if (!amountNum && pricing) {
      amountNum = Number(pricing.item_amount ?? 0) + Number(pricing.platform_fee_amount ?? 0) + Number(pricing.payment_processing_fee_amount ?? 0);
    }
    const sla = slaFor({
      status: r.status,
      seller_response_due_at: r.seller_response_due_at,
      resolved_at: r.resolved_at,
    });
    return {
      dispute_id: r.id,
      dispute_code: `DIS-${r.id.slice(0, 8).toUpperCase()}`,
      transaction_id: r.transaction_id,
      transaction_code: tx?.transaction_code ?? "",
      item_title: firstItem?.title ?? "(Untitled)",
      priority: priorityFor({
        status: r.status,
        seller_response_due_at: r.seller_response_due_at,
        opened_at: r.opened_at,
        resolved_at: r.resolved_at,
      }),
      reason_label: REASON_LABELS[r.reason] ?? "Other",
      reason_raw: r.reason,
      parties: {
        buyer: { name: tx?.buyer?.full_name ?? "Buyer", avatar_url: tx?.buyer?.avatar_url ?? null },
        seller: {
          name: tx?.seller?.full_name ?? "Seller",
          avatar_url: tx?.seller?.avatar_url ?? null,
          store_name: null,
          verified: false,
        },
      },
      amount: amountNum,
      currency: (pricing?.currency_code as "NGN") ?? "NGN",
      money_status: tx?.money_status ?? "",
      dispute_status: r.status,
      outcome: outcome
        ? { type: outcome.outcome_type, refund_amount: outcome.refund_amount, release_amount: outcome.release_amount }
        : null,
      sla,
      agent: null,
      opened_at: r.opened_at,
      resolved_at: r.resolved_at,
    };
  });

  // Amount bucket filter
  if (params.amount_bucket) {
    rows = rows.filter((r) => {
      const a = r.amount;
      switch (params.amount_bucket) {
        case "lt_100k": return a < 100000;
        case "100k_1m": return a >= 100000 && a < 1000000;
        case "1m_5m": return a >= 1000000 && a < 5000000;
        case "gt_5m": return a >= 5000000;
        default: return true;
      }
    });
  }

  // Search filter (in-memory after fetch. Small page sizes)
  if (params.q) {
    const needle = params.q.toLowerCase();
    rows = rows.filter((r) =>
      r.dispute_code.toLowerCase().includes(needle) ||
      r.transaction_code.toLowerCase().includes(needle) ||
      r.item_title.toLowerCase().includes(needle) ||
      r.parties.buyer.name.toLowerCase().includes(needle) ||
      r.parties.seller.name.toLowerCase().includes(needle),
    );
  }
  if (params.priority) rows = rows.filter((r) => r.priority === params.priority);
  if (params.money_status) rows = rows.filter((r) => r.money_status === params.money_status);

  const filters = {
    reasons: Object.keys(REASON_LABELS),
    agents: [] as { user_id: string; name: string }[],
    amount_buckets: ["lt_100k", "100k_1m", "1m_5m", "gt_5m"],
  };

  return {
    kpis,
    rows,
    filters,
    pagination: { page, page_size: pageSize, total: count ?? rows.length },
  };
}

function toCsv(rows: ReturnType<typeof buildPayload> extends Promise<infer T> ? T extends { rows: infer R } ? R : never : never): string {
  const header = [
    "dispute_code","transaction_code","item_name","buyer_name","seller_name","amount","currency",
    "dispute_reason","dispute_status","money_status","priority","sla_state","due_at","assigned_admin","opened_at","resolved_at",
  ];
  const lines = [header.join(",")];
  for (const r of rows as unknown as Array<Record<string, unknown> & {
    dispute_code: string; transaction_code: string; item_title: string;
    parties: { buyer: { name: string }; seller: { name: string; store_name: string | null } };
    amount: number; currency: string; reason_raw: string; dispute_status: string; money_status: string;
    priority: string; sla: { due_at_iso: string | null; overdue_by_minutes: number | null };
    opened_at: string; resolved_at: string | null;
  }>) {
    const slaState = r.sla.overdue_by_minutes != null ? "overdue" : (r.sla.due_at_iso ? "due" : "");
    const cells = [
      r.dispute_code, r.transaction_code, r.item_title, r.parties.buyer.name,
      r.parties.seller.store_name || r.parties.seller.name, String(r.amount), r.currency,
      r.reason_raw, r.dispute_status, r.money_status, r.priority, slaState,
      r.sla.due_at_iso ?? "", "", r.opened_at, r.resolved_at ?? "",
    ];
    lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let ctx;
    try { ctx = await requirePermission(req, "disputes.view"); }
    catch (err) {
      const resp = authErrorResponse(err, corsHeaders);
      if (resp) return resp;
      throw err;
    }
    const adminClient = ctx.adminClient;

    const params = parseParams(req);
    const payload = await buildPayload(adminClient, params);

    if (params.format === "csv") {
      return csvResponse(toCsv(payload.rows as never), `disputes-${new Date().toISOString().slice(0,10)}.csv`);
    }
    return jsonResponse(payload);
  } catch (e) {
    return errResponse(`Unexpected error: ${(e as Error).message}`, 500);
  }
});