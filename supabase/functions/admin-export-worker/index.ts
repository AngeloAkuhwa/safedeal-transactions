/**
 * Admin Export Worker: runs a queued admin_export_jobs record, generates a
 * CSV, uploads it to the private `admin-exports` bucket, and marks the job
 * completed with the resulting file_path / row_count / size.
 *
 * Invoked service-to-service from `admin-export-enqueue`. Never exposed to
 * end users (guarded by verifying the caller's service-role bearer token).
 *
 * NEW export types can be added by appending a builder in `BUILDERS`: no
 * schema change required.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildDirectory as buildUsersDirectory,
  applyFilters as applyDirFilters,
  sortRows as sortDirRows,
  type DirFilters,
} from "../_shared/users-directory-engine.ts";
import {
  buildRows as buildFlaggedRows,
  applyFilters as applyFlaggedFilters,
  sortRows as sortFlaggedRows,
} from "../_shared/flagged-users-engine.ts";

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
 * Placeholder builders: the sync versions still work; they'll be migrated
 * to this worker one by one. For now, calling those types returns a stub CSV
 * with a header row so the async pipeline is wired end-to-end.
 */
const buildStubCsv = (label: string): Builder => async () => {
  const header = ["notice"].join(",");
  const row = [csvEscape(`${label}: async export coming soon. Use the sync endpoint for now.`)].join(",");
  return { csv: `${header}\n${row}`, rowCount: 0 };
};

const buildUsersDirectoryCsv: Builder = async (admin, params) => {
  const filters: DirFilters = {
    q: String(params.q ?? ""),
    role: (params.role as DirFilters["role"]) ?? "all",
    status: (params.status as DirFilters["status"]) ?? "all",
    verification: (params.verification as DirFilters["verification"]) ?? "all",
    range: (params.range as DirFilters["range"]) ?? "all",
  };
  const sort = String(params.sort ?? "recent");
  let rows = await buildUsersDirectory(admin);
  rows = applyDirFilters(rows, filters);
  sortDirRows(rows, sort);
  rows = rows.slice(0, 100_000);
  const header = [
    "public_user_id","full_name","handle","email","phone",
    "roles","verification_level","id_status",
    "transactions_count","transactions_volume_ngn",
    "disputes_total","disputes_active",
    "status","is_suspended","is_flagged","joined_at",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.display_id, r.full_name, r.handle, r.email, r.phone ?? "",
      (r.roles ?? []).join("; "),
      r.verification?.level ?? "", r.verification?.id_status ?? "",
      r.transactions?.count ?? 0, r.transactions?.volume ?? 0,
      r.disputes?.total ?? 0, r.disputes?.active ?? 0,
      r.status, r.is_suspended ? "yes" : "no", r.is_flagged ? "yes" : "no",
      r.joined_at ?? "",
    ].map(csvEscape).join(","));
  }
  return { csv: lines.join("\n"), rowCount: rows.length };
};

const buildFlaggedUsersCsv: Builder = async (admin, params) => {
  const range = String(params.range ?? "30d");
  const filters = {
    risk: String(params.risk ?? "all"),
    reason: String(params.reason ?? "all"),
    status: String(params.status ?? "all"),
    q: String(params.q ?? ""),
  };
  const sort = String(params.sort ?? "recent");
  let rows = await buildFlaggedRows(admin, range);
  rows = applyFlaggedFilters(rows, filters);
  sortFlaggedRows(rows, sort);
  rows = rows.slice(0, 100_000);
  const header = [
    "public_user_id","full_name","email","phone",
    "risk_level","risk_score","status",
    "flag_reasons","amount_at_risk",
    "disputes_30d","refunds_30d",
    "latest_transaction_code","latest_transaction_id",
    "flagged_by","flagged_by_type","flagged_at","auto_detected",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.user?.display_id ?? "",
      r.user?.full_name ?? "",
      r.user?.email ?? "",
      r.user?.phone ?? "",
      r.risk?.level ?? "",
      r.risk?.score ?? 0,
      r.status,
      (r.flag_reasons ?? []).map((x) => x.label).join("; "),
      r.related_context?.amount_at_risk ?? 0,
      r.related_context?.disputes_30d ?? 0,
      r.related_context?.refunds_30d ?? 0,
      r.related_context?.latest_transaction_code ?? "",
      r.related_context?.latest_transaction_id ?? "",
      r.flagged_by?.label ?? r.flagged_by?.admin_name ?? "",
      r.flagged_by?.type ?? "",
      r.flagged_at ?? "",
      r.auto_detected ? "yes" : "no",
    ].map(csvEscape).join(","));
  }
  return { csv: lines.join("\n"), rowCount: rows.length };
};

const buildTransactionsMonitorCsv: Builder = async (admin, params) => {
  // Query transactions with filters at SQL layer, hydrate pricing + names.
  const search = String(params.search ?? params.q ?? "").trim();
  const txStatus = String(params.transactionStatus ?? params.transaction_status ?? "all");
  const moneyStatus = String(params.moneyStatus ?? params.money_status ?? "all");
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;
  const amountMin = Number(params.amountMin ?? 0) || 0;
  const amountMax = Number(params.amountMax ?? 0) || 0;

  let q = admin.from("transactions").select(
    "id, transaction_code, status, money_status, dispute_status, created_at, updated_at, buyer_id, seller_id",
  ).order("created_at", { ascending: false }).limit(100_000);
  if (txStatus !== "all") q = q.eq("status", txStatus);
  if (moneyStatus !== "all") q = q.eq("money_status", moneyStatus);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);
  if (search) q = q.ilike("transaction_code", `%${search}%`);
  const { data: txs, error } = await q;
  if (error) throw new Error(`transactions_select_failed: ${error.message}`);

  let rows = txs ?? [];
  const ids = rows.map((t: any) => t.id);
  const chunk = <T,>(arr: T[], n: number) => {
    const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out;
  };
  const priceMap = new Map<string, number>();
  for (const c of chunk(ids, 500)) {
    const { data: pricing } = await admin.from("transaction_pricing")
      .select("transaction_id, buyer_total_amount").in("transaction_id", c);
    for (const p of pricing ?? []) priceMap.set(p.transaction_id as string, Number(p.buyer_total_amount ?? 0));
  }
  if (amountMin > 0) rows = rows.filter((t: any) => (priceMap.get(t.id) ?? 0) >= amountMin);
  if (amountMax > 0) rows = rows.filter((t: any) => (priceMap.get(t.id) ?? 0) <= amountMax);
  const profileIds = new Set<string>();
  for (const t of rows) {
    if (t.buyer_id) profileIds.add(t.buyer_id);
    if (t.seller_id) profileIds.add(t.seller_id);
  }
  const nameMap = new Map<string, { name: string; email: string }>();
  for (const c of chunk(Array.from(profileIds), 500)) {
    const { data: profs } = await admin.from("profiles").select("id, full_name, email").in("id", c);
    for (const p of profs ?? []) nameMap.set(p.id as string, { name: (p.full_name as string) ?? "Unknown", email: (p.email as string) ?? "" });
  }

  const header = [
    "transaction_code","created_at","updated_at",
    "transaction_status","money_status","dispute_status",
    "buyer_name","buyer_email","seller_name","seller_email",
    "buyer_total_ngn",
  ];
  const lines = [header.join(",")];
  for (const t of rows) {
    const b = nameMap.get(t.buyer_id ?? "") ?? { name: "", email: "" };
    const s = nameMap.get(t.seller_id ?? "") ?? { name: "", email: "" };
    lines.push([
      t.transaction_code, t.created_at, t.updated_at,
      t.status, t.money_status, t.dispute_status ?? "",
      b.name, b.email, s.name, s.email,
      // Empty, not 0. A transaction with no pricing row has no known total,
      // and `0` in a money column of a financial export is a factual claim
      // that it was worth nothing. The two filters above keep `?? 0` because
      // there "absent" correctly means "outside any amount range"; only the
      // exported VALUE is a statement about the transaction.
      priceMap.get(t.id) ?? "",
    ].map(csvEscape).join(","));
  }
  return { csv: lines.join("\n"), rowCount: rows.length };
};

/* -------- Audit logs (admin_actions) -------- */

type AuditSev = "critical" | "high" | "medium" | "low" | "info";
function auditSeverity(action: string): AuditSev {
  const a = (action || "").toLowerCase();
  if (/suspend|freeze|block|impersonat|reveal|delete|force|purge/.test(a)) return "critical";
  if (/role|setting|dispute_resolve|refund|override|policy|escrow_alert/.test(a)) return "high";
  if (/retry|broadcast|notification|review|approve|reject/.test(a)) return "medium";
  if (/view|export|list|search/.test(a)) return "info";
  return "low";
}
const AUDIT_ACTION_TYPES: string[] = [
  "add_internal_note","add_note","clear_flag","close_case","escalate_case",
  "export_data","extend_deadline","flag_for_review","flag_user","freeze_transaction",
  "high_value_flag","open_investigation","refund_buyer","release_funds","request_evidence",
  "resolve_dispute","retry_refund","set_vendor_status","suspend_user","toggle_auto_release","unflag_user",
  "unfreeze_transaction","unsuspend_user","update_investigation","update_setting",
];
function parseAuditNotes(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v as Record<string, unknown> : {}; }
  catch { return { legacy_notes: raw }; }
}

const buildAuditLogsCsv: Builder = async (admin, params) => {
  const q = String(params.q ?? "").trim();
  const actionType = String(params.action_type ?? "all");
  const actorId = String(params.actor_id ?? "all");
  const severity = String(params.severity ?? "all") as AuditSev | "all";
  const from = params.from ? String(params.from) : null;
  const to = params.to ? String(params.to) : null;
  const compliance = Boolean(params.compliance);

  let query = admin.from("admin_actions").select(
    "id, admin_user_id, target_user_id, transaction_id, dispute_id, action_type, action_notes, created_at",
  );
  if (actionType !== "all") query = query.eq("action_type", actionType);
  if (actorId !== "all") query = query.eq("admin_user_id", actorId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (severity && severity !== "all") {
    const wanted = AUDIT_ACTION_TYPES.filter((a) => auditSeverity(a) === severity);
    if (wanted.length === 0) return { csv: "", rowCount: 0 };
    query = query.in("action_type", wanted);
  }
  if (q) {
    const uuid = /^[0-9a-f-]{36}$/i.test(q);
    if (uuid) {
      query = query.or(
        `id.eq.${q},target_user_id.eq.${q},transaction_id.eq.${q},dispute_id.eq.${q},admin_user_id.eq.${q}`,
      );
    } else {
      const like = `%${q.replace(/[,()]/g, " ")}%`;
      const qLower = q.toLowerCase();
      const matchedTypes = AUDIT_ACTION_TYPES.filter((t) => t.toLowerCase().includes(qLower));
      const parts = [`action_notes.ilike.${like}`];
      if (matchedTypes.length) parts.push(`action_type.in.(${matchedTypes.join(",")})`);
      query = query.or(parts.join(","));
    }
  }
  query = query.order("created_at", { ascending: false }).limit(100_000);
  const { data: rows, error } = await query;
  if (error) throw new Error(`audit_logs_select_failed: ${error.message}`);

  const list = rows ?? [];
  const userIds = Array.from(new Set(
    list.flatMap((r: any) => [r.admin_user_id, r.target_user_id]).filter(Boolean),
  )) as string[];
  const chunk = <T,>(arr: T[], n: number) => {
    const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out;
  };
  const pmap = new Map<string, { name: string; email: string }>();
  const rmap = new Map<string, string>();
  for (const c of chunk(userIds, 500)) {
    const { data: profs } = await admin.from("profiles").select("id, full_name, email").in("id", c);
    for (const p of profs ?? []) pmap.set(p.id as string, { name: (p.full_name as string) ?? "Admin", email: (p.email as string) ?? "" });
    const { data: roles } = await admin.from("user_roles").select("user_id, role").in("user_id", c);
    for (const r of roles ?? []) if (!rmap.has(r.user_id as string)) rmap.set(r.user_id as string, r.role as string);
  }

  const header = [
    "id", "created_at", "action_type", "severity",
    "actor_id", "actor_name", "actor_email", "actor_role",
    "target_user_id", "target_user_email",
    "transaction_id", "dispute_id",
    "ip", "user_agent", "reason", "changed_keys", "description",
  ];
  const lines: string[] = [];
  if (compliance) {
    lines.push(csvEscape(`# Compliance report: generated ${new Date().toISOString()}, range ${from ?? "*"}\u2192${to ?? "*"}, severity=${severity}`));
    lines.push(csvEscape(`# Rows: ${list.length}`));
  }
  lines.push(header.join(","));
  for (const r of list as any[]) {
    const notes = parseAuditNotes(r.action_notes);
    const actor = pmap.get(r.admin_user_id) ?? { name: "Admin", email: "" };
    const target = r.target_user_id ? pmap.get(r.target_user_id) : null;
    const changed = Array.isArray(notes.changed_keys) ? (notes.changed_keys as string[]).join("; ") : "";
    const desc = (notes.reason as string) ?? r.action_type;
    lines.push([
      r.id, r.created_at, r.action_type, auditSeverity(r.action_type),
      r.admin_user_id, actor.name, actor.email, rmap.get(r.admin_user_id) ?? "admin",
      r.target_user_id ?? "", target?.email ?? "",
      r.transaction_id ?? "", r.dispute_id ?? "",
      (notes.ip as string) ?? "", (notes.user_agent as string) ?? "",
      (notes.reason as string) ?? "", changed, desc,
    ].map(csvEscape).join(","));
  }
  return { csv: lines.join("\n"), rowCount: list.length };
};

const BUILDERS: Record<string, Builder> = {
  escrow: buildEscrowCsv,
  users_directory: buildUsersDirectoryCsv,
  flagged_users: buildFlaggedUsersCsv,
  transactions_monitor: buildTransactionsMonitorCsv,
  user_detail: buildStubCsv("user_detail"),
  audit_logs: buildAuditLogsCsv,
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
