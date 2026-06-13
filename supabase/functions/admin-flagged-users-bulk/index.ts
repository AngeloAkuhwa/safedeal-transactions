/**
 * Admin Flagged Users - bulk action endpoint.
 * POST { action, user_ids[], note } → loops, returns success/failure counts.
 * Admin-only.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type BulkAction = "suspend" | "clear" | "escalate" | "add_note";

const ACTION_MAP: Record<BulkAction, string> = {
  suspend: "suspend_user",
  clear: "clear_flag",
  escalate: "escalate_case",
  add_note: "add_note",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  const action = body.action as BulkAction;
  const user_ids = (body.user_ids as string[]) ?? [];
  const note = ((body.note as string) ?? "").trim();

  if (!action || !ACTION_MAP[action]) return json(400, { error: "invalid_action" });
  if (!Array.isArray(user_ids) || user_ids.length === 0) return json(400, { error: "no_users" });
  if (!note) return json(400, { error: "note_required" });

  const mappedAction = ACTION_MAP[action];
  const succeeded: string[] = [];
  const failed: { user_id: string; error: string }[] = [];

  for (const uid of user_ids) {
    try {
      if (mappedAction === "suspend_user") {
        const { error: upErr } = await admin.from("profiles").update({ status: "suspended" }).eq("id", uid);
        if (upErr) throw upErr;
      }
      const { error: insErr } = await admin.from("admin_actions").insert({
        admin_user_id: ctx.userId,
        target_user_id: uid,
        action_type: mappedAction,
        action_notes: `[bulk] ${note}`.slice(0, 1000),
      });
      if (insErr) throw insErr;
      succeeded.push(uid);
    } catch (e) {
      failed.push({ user_id: uid, error: (e as Error).message ?? "unknown_error" });
    }
  }

  return json(200, {
    ok: true,
    action,
    success_count: succeeded.length,
    failure_count: failed.length,
    succeeded,
    failed,
  });
});