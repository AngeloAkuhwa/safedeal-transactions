/**
 * Admin Export Worker — runs a queued admin_export_jobs record, generates a
 * CSV, uploads it to the private `admin-exports` bucket, and marks the job
 * completed with the resulting file_path / row_count / size.
 *
 * Invoked service-to-service from `admin-export-enqueue`. Never exposed to
 * end users (guarded by verifying the caller's service-role bearer token).
 *
 * NEW export types can be added by appending a builder in `BUILDERS` — no
 * schema change required.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/* ---------------- Builders ---------------- */

type Builder = (admin: SupabaseClient, params: Record<string, unknown>) => Promise<{ csv: string; rowCount: number }>;

const buildEscrowCsv: Builder = async (admin, params) => {
  const state = String(params.state ?? "all");
  const dateRange = String(params.date_range ?? "30d");
  const amountBucket = String(params.amount_bucket ?? "any");
  const flag = String(params.flag ?? "all");
  const q = String(params.q ?? "").trim().toLowerCase();
  const now = Date.now();

  const { data: states } = await admin
    .from("escrow_states")
    .select("transaction_id, state, held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at");

  const { data: pendingTx } = await admin
    .from("transactions").select("id").eq("money_status", "funds_releasing");
  const pendingIds = new Set((pendingTx ?? []).map((t: any) => t.id));

  let candidate = (states ?? []).filter((s: any) =>
    Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0) + Number(s.released_amount ?? 0) + Number(s.refunded_amount ?? 0) > 0
  );

  if (state !== "all") {
    const fns: Record<string, (s: any) => boolean> = {
      held: (s) => Number(s.held_amount ?? 0) > 0,
      frozen: (s) => Number(s.frozen_amount ?? 0) > 0,
      pending_release: (s) => pendingIds.has(s.transaction_id),
      released: (s) => Number(s.released_amount ?? 0) > 0,
      refunded: (s) => Number(s.refunded_amount ?? 0) > 0,
    };
    const fn = fns[state]; if (fn) candidate = candidate.filter(fn);
  }

  const dateCutoff = dateRange === "today" ? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()
    : dateRange === "7d" ? now - 7 * DAY_MS
    : dateRange === "30d" ? now - 30 * DAY_MS : 0;
  if (dateCutoff > 0) {
    candidate = candidate.filter((s: any) => new Date(s.last_changed_at).getTime() >= dateCutoff);
  }

  if (amountBucket !== "any") {
    const bands: Record<string, [number, number]> = {
      lt_100k: [0, 100_000],
      "100k_1m": [100_000, 1_000_000],
      gt_1m: [1_000_000, Number.POSITIVE_INFINITY],
    };
    const [lo, hi] = bands[amountBucket] ?? [0, Number.POSITIVE_INFINITY];
    candidate = candidate.filter((s: any) => {
      const v = Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0);
      return v >= lo && v < hi;
    });
  }

  // Background worker: raise cap significantly vs the 5k sync limit.
  candidate = candidate.slice(0, 100_000);

  const ids = candidate.map((s: any) => s.transaction_id);
  // Batch profile / tx lookups in chunks of 500 to stay under Postgres param limits.
  const chunk = <T,>(arr: T[], n: number) => {
    const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out;
  };
  const txMap = new Map<string, any>();
  const disputed = new Set<string>();
  const profileIds = new Set<string>();
  for (const ids500 of chunk(ids, 500)) {
    const { data: txs } = await admin
      .from("transactions")
      .select("id, transaction_code, created_at, money_status, transaction_status, buyer_id, seller_id")
      .in("id", ids500);
    for (const t of txs ?? []) {
      txMap.set(t.id, t);
      if (t.buyer_id) profileIds.add(t.buyer_id);
      if (t.seller_id) profileIds.add(t.seller_id);
    }
    const { data: disp } = await admin
      .from("disputes").select("transaction_id, status").in("transaction_id", ids500).neq("status", "resolved");
    for (const d of disp ?? []) disputed.add(d.transaction_id);
  }
  const pmap = new Map<string, string>();
  for (const pIds of chunk(Array.from(profileIds), 500)) {
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", pIds);
    for (const p of profiles ?? []) pmap.set(p.id, (p.full_name as string) ?? "Unknown");
  }

  const header = [
    "transaction_code", "created_at", "money_status", "transaction_status",
    "buyer", "seller", "total_held", "frozen", "releasable", "released", "refunded",
    "state", "last_changed_at", "flagged",
  ];
  const rows: string[] = [header.join(",")];
  let emitted = 0;
  for (const s of candidate) {
    const tx = txMap.get(s.transaction_id);
    if (!tx) continue;
    const buyerName = pmap.get(tx.buyer_id) ?? "Unknown";
    const sellerName = pmap.get(tx.seller_id) ?? "Unknown";
    if (q) {
      const hay = `${tx.transaction_code} ${buyerName} ${sellerName}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const totalHeld = Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0);
    if (flag === "high_value" && totalHeld < 1_000_000) continue;
    if ((flag === "disputed" || flag === "flagged") && !disputed.has(tx.id)) continue;

    let derived = "held";
    if (Number(s.frozen_amount) > 0) derived = "frozen";
    else if (tx.money_status === "funds_releasing") derived = "pending_release";
    else if (Number(s.released_amount) > 0 && Number(s.held_amount) === 0 && Number(s.frozen_amount) === 0) derived = "released";
    else if (Number(s.refunded_amount) > 0) derived = "refunded";

    rows.push([
      tx.transaction_code, tx.created_at, tx.money_status, tx.transaction_status,
      buyerName, sellerName,
      totalHeld, Number(s.frozen_amount ?? 0), Number(s.held_amount ?? 0),
      Number(s.released_amount ?? 0), Number(s.refunded_amount ?? 0),
      derived, s.last_changed_at, disputed.has(tx.id),
    ].map(csvEscape).join(","));
    emitted++;
  }
  return { csv: rows.join("\n"), rowCount: emitted };
};

/**
 * Placeholder builders — the sync versions still work; they'll be migrated
 * to this worker one by one. For now, calling those types returns a stub CSV
 * with a header row so the async pipeline is wired end-to-end.
 */
const buildStubCsv = (label: string): Builder => async () => {
  const header = ["notice"].join(",");
  const row = [csvEscape(`${label}: async export coming soon — use the sync endpoint for now.`)].join(",");
  return { csv: `${header}\n${row}`, rowCount: 0 };
};

const BUILDERS: Record<string, Builder> = {
  escrow: buildEscrowCsv,
  users_directory: buildStubCsv("users_directory"),
  flagged_users: buildStubCsv("flagged_users"),
  transactions_monitor: buildStubCsv("transactions_monitor"),
  user_detail: buildStubCsv("user_detail"),
};

/* ---------------- Handler ---------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Service-role only. Reject any caller that isn't presenting the SR key.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.endsWith(serviceRoleKey)) {
    return json({ error: "forbidden" }, 403);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: { job_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const jobId = body.job_id;
  if (!jobId) return json({ error: "job_id_required" }, 400);

  // Atomically claim the job (queued -> running).
  const { data: claimed, error: claimErr } = await admin
    .from("admin_export_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId).eq("status", "queued")
    .select("id, requester_id, export_type, params")
    .maybeSingle();
  if (claimErr) return json({ error: "claim_failed", detail: claimErr.message }, 500);
  if (!claimed) return json({ error: "already_claimed_or_missing" }, 409);

  const builder = BUILDERS[claimed.export_type];
  if (!builder) {
    await admin.from("admin_export_jobs")
      .update({ status: "failed", error_message: `unsupported_export_type:${claimed.export_type}`, completed_at: new Date().toISOString() })
      .eq("id", jobId);
    return json({ error: "unsupported_export_type" }, 400);
  }

  try {
    const { csv, rowCount } = await builder(admin, (claimed.params as Record<string, unknown>) ?? {});
    const bytes = new TextEncoder().encode(csv);
    const filePath = `${claimed.requester_id}/${jobId}.csv`;

    const { error: upErr } = await admin.storage
      .from("admin-exports")
      .upload(filePath, bytes, {
        contentType: "text/csv; charset=utf-8",
        upsert: true,
      });
    if (upErr) throw new Error(`storage_upload_failed: ${upErr.message}`);

    await admin.from("admin_export_jobs").update({
      status: "completed",
      row_count: rowCount,
      file_path: filePath,
      file_size_bytes: bytes.byteLength,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    return json({ ok: true, job_id: jobId, row_count: rowCount, file_path: filePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin-export-worker] job failed", jobId, msg);
    await admin.from("admin_export_jobs").update({
      status: "failed", error_message: msg, completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    return json({ error: "worker_failed", detail: msg }, 500);
  }
});
