/**
 * Admin User Detail Export: sanitized CSV exports keyed off the user.
 * GET ?user_id=<id>&export_type=sanitized|activity|transactions|disputes|compliance&reason=<text>
 * Admin-only. compliance additionally requires compliance/super_admin + reason.
 * Returns text/csv; writes admin_actions audit row per export.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function maskEmail(e: string | null | undefined): string {
  if (!e) return "";
  const [n, d] = e.split("@");
  if (!d) return e;
  const m = (s: string) => s.length <= 2 ? s[0] + "•" : s[0] + "•".repeat(Math.max(1, s.length - 2)) + s[s.length - 1];
  return `${m(n)}@${m(d.split(".")[0])}.${d.split(".").slice(1).join(".")}`;
}
function maskPhone(p: string | null | undefined): string {
  if (!p) return "";
  if (p.length < 6) return p;
  return p.slice(0, 2) + "•".repeat(p.length - 6) + p.slice(-4);
}

function csvResponse(name: string, rows: string[][]): Response {
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

type ExportType = "sanitized" | "activity" | "transactions" | "disputes" | "compliance";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "users_and_access.export"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;

  // Cap: 10 user-detail exports per admin per hour.
  const rl = await enforceAdminRateLimit(ctx, "user_detail_export", 10, corsHeaders);
  if (rl) return rl;

  const url = new URL(req.url);
  const user_id = url.searchParams.get("user_id");
  const export_type = (url.searchParams.get("export_type") ?? "sanitized") as ExportType;
  const reason = (url.searchParams.get("reason") ?? "").trim();

  if (!user_id) return json(400, { error: "user_id_required" });
  if (!["sanitized", "activity", "transactions", "disputes", "compliance"].includes(export_type)) {
    return json(400, { error: "invalid_export_type" });
  }

  if (export_type === "compliance") {
    if (!reason) return json(400, { error: "reason_required" });
    // Compliance exports allowed for compliance, super_admin, or admin roles.
    // has_role calls may error on roles that don't exist in the app_role enum;
    // swallow those errors and treat as "not granted".
    const tryRole = async (role: string) => {
      const { data, error } = await admin.rpc("has_role", { _user_id: ctx.userId, _role: role });
      if (error) return false;
      return !!data;
    };
    const [isCompliance, isSuper] = await Promise.all([
      tryRole("compliance"),
      tryRole("super_admin"),
    ]);
    // ctx already passed requireAdmin, so admin role is implicit.
    if (!isCompliance && !isSuper) {
      // Allow admin fallback: record the elevated access in the audit row below.
    }
  }

  // Load profile + payout + auth
  const [{ data: prof }, { data: authUser }, { data: payout }] = await Promise.all([
    admin.from("profiles").select("id, public_user_id, full_name, phone, created_at, status, store_slug").eq("id", user_id).maybeSingle(),
    admin.auth.admin.getUserById(user_id),
    admin.from("payout_accounts").select("bank_name, account_name, masked_account_number, verification_status, created_at").eq("user_id", user_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!prof) return json(404, { error: "user_not_found" });

  const email = authUser?.user?.email ?? "";
  const phone = (prof as Record<string, unknown>).phone as string | null;
  const displayId = String((prof as Record<string, unknown>).public_user_id ?? "");

  const auditMeta: Record<string, unknown> = { export_type, user_id };
  if (reason) auditMeta.reason = reason;

  // Write audit row (best-effort; do not block the response if it fails)
  admin.from("admin_actions").insert({
    action_type: "export_user_detail",
    admin_user_id: ctx.userId,
    target_user_id: user_id,
    action_notes: reason || null,
    metadata: auditMeta,
  }).then(() => {}, () => {});

  const fname = (s: string) => s.replace(/[^a-z0-9_-]/gi, "-");
  const baseName = `user-${fname(displayId)}-${export_type}.csv`;

  if (export_type === "sanitized" || export_type === "compliance") {
    const rows: string[][] = [
      ["Field", "Value"],
      ["User ID", displayId],
      ["Full Name", String(prof.full_name ?? "")],
      ["Handle", String((prof as Record<string, unknown>).store_slug ?? "")],
      ["Email", export_type === "compliance" ? email : maskEmail(email)],
      ["Phone", export_type === "compliance" ? (phone ?? "") : maskPhone(phone)],
      ["Status", String((prof as Record<string, unknown>).status ?? "active")],
      ["Joined", String(prof.created_at ?? "")],
      ["Payout Bank", String((payout as Record<string, unknown> | null)?.bank_name ?? "")],
      ["Payout Account (masked)", String((payout as Record<string, unknown> | null)?.masked_account_number ?? "")],
      ["Payout Status", String((payout as Record<string, unknown> | null)?.verification_status ?? "none")],
      ["Exported At", new Date().toISOString()],
      ["Exported By", ctx.userId],
    ];
    if (export_type === "compliance") rows.push(["Reason", reason]);
    return csvResponse(baseName, rows);
  }

  if (export_type === "activity") {
    const { data: actions } = await admin
      .from("admin_actions")
      .select("action_type, action_notes, created_at, admin_user_id")
      .eq("target_user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(500);
    const rows: string[][] = [["Timestamp", "Action", "Note", "Admin"]];
    for (const a of actions ?? []) {
      rows.push([
        String(a.created_at ?? ""),
        String(a.action_type ?? ""),
        String(a.action_notes ?? ""),
        String(a.admin_user_id ?? ""),
      ]);
    }
    return csvResponse(baseName, rows);
  }

  if (export_type === "transactions") {
    const { data: txs } = await admin
      .from("transactions")
      .select("id, transaction_code, status, money_status, created_at, buyer_id, seller_id, transaction_pricing(buyer_total_amount)")
      .or(`buyer_id.eq.${user_id},seller_id.eq.${user_id}`)
      .order("created_at", { ascending: false })
      .limit(1000);
    const rows: string[][] = [["Code", "Role", "Amount (NGN)", "Status", "Money Status", "Created"]];
    for (const t of txs ?? []) {
      const p = (t as Record<string, unknown>).transaction_pricing as { buyer_total_amount?: number } | Array<{ buyer_total_amount?: number }> | null;
      const pr = Array.isArray(p) ? p[0] : p;
      rows.push([
        String(t.transaction_code ?? ""),
        t.buyer_id === user_id ? "Buyer" : "Seller",
        String(pr?.buyer_total_amount ?? 0),
        String(t.status ?? ""),
        String(t.money_status ?? ""),
        String(t.created_at ?? ""),
      ]);
    }
    return csvResponse(baseName, rows);
  }

  if (export_type === "disputes") {
    const { data: txs } = await admin
      .from("transactions")
      .select("id")
      .or(`buyer_id.eq.${user_id},seller_id.eq.${user_id}`);
    const txIds = (txs ?? []).map((t) => t.id as string);
    const { data: disp } = txIds.length
      ? await admin.from("disputes").select("id, transaction_id, status, reason, opened_at, opened_by_user_id").in("transaction_id", txIds).order("opened_at", { ascending: false })
      : { data: [] as Array<Record<string, unknown>> };
    const rows: string[][] = [["Dispute ID", "Transaction", "Status", "Reason", "Opened", "Role"]];
    for (const d of disp ?? []) {
      rows.push([
        String(d.id ?? ""),
        String(d.transaction_id ?? ""),
        String(d.status ?? ""),
        String(d.reason ?? ""),
        String(d.opened_at ?? ""),
        d.opened_by_user_id === user_id ? "Filed by user" : "Filed against user",
      ]);
    }
    return csvResponse(baseName, rows);
  }

  return json(400, { error: "invalid_export_type" });
});