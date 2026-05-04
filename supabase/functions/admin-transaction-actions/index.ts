import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ACTIVE_DISPUTE = ["open", "seller_response_pending", "under_review"];

type ActionName =
  | "add_internal_note"
  | "freeze"
  | "unfreeze"
  | "flag_for_review"
  | "escalate_dispute";

interface Body {
  action: ActionName;
  transactionId: string;
  payload?: Record<string, unknown>;
}

async function gateAdmin(req: Request): Promise<{ admin: any; userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await userClient.auth.getClaims(token);
  if (error || !data?.claims) return json({ error: "unauthorized" }, 401);
  const userId = data.claims.sub as string;
  const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleErr || !isAdmin) return json({ error: "admin_access_required" }, 403);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return { admin, userId };
}

function badRequest(msg: string) {
  return json({ error: msg }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return badRequest("invalid_json");
  }
  if (!body?.action || !body?.transactionId) return badRequest("missing_fields");

  // Explicit refusal of money-movement actions
  if (["release_funds", "refund_buyer"].includes(body.action as string)) {
    return badRequest("Refund must be handled from dispute or payout review");
  }

  const gated = await gateAdmin(req);
  if (gated instanceof Response) return gated;
  const { admin, userId } = gated;
  const txId = body.transactionId;
  const payload = (body.payload ?? {}) as Record<string, any>;

  // Load transaction snapshot
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, status, money_status, dispute_status, seller_id, needs_release_review, transaction_code")
    .eq("id", txId)
    .single();
  if (txErr || !tx) return json({ error: "transaction_not_found" }, 404);

  try {
    switch (body.action) {
      case "add_internal_note": {
        const note = String(payload.note ?? "").trim();
        if (note.length < 1 || note.length > 2000) return badRequest("note_invalid");
        const { error } = await admin.from("admin_transaction_notes").insert({
          transaction_id: txId,
          admin_user_id: userId,
          note,
        });
        if (error) throw error;
        await admin.from("admin_actions").insert({
          admin_user_id: userId,
          transaction_id: txId,
          action_type: "add_internal_note",
          action_notes: note.slice(0, 500),
        });
        await admin.from("audit_logs").insert({
          action: "admin_internal_note",
          actor_user_id: userId,
          transaction_id: txId,
          description: `Admin added internal note to ${tx.transaction_code}`,
        });
        return json({ ok: true });
      }

      case "freeze": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("reason_min_8");
        if (tx.money_status !== "funds_held_in_escrow")
          return badRequest("Transaction is not eligible for freeze");

        // freeze_funds_atomic handles state + history
        const { error: rpcErr } = await admin.rpc("freeze_funds_atomic", {
          p_transaction_id: txId,
          p_actor: userId,
          p_reason: reason,
        });
        if (rpcErr) throw rpcErr;
        await admin.from("admin_actions").insert({
          admin_user_id: userId,
          transaction_id: txId,
          action_type: "freeze_transaction",
          action_notes: reason,
        });
        await admin.from("audit_logs").insert({
          action: "admin_freeze",
          actor_user_id: userId,
          transaction_id: txId,
          description: `Admin froze ${tx.transaction_code}: ${reason}`,
        });
        return json({ ok: true });
      }

      case "unfreeze": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("reason_min_8");
        if (tx.money_status !== "funds_frozen")
          return badRequest("Transaction is not currently frozen");

        // Move money_status frozen -> funds_pending_release (allowed by validate_money_transition)
        const { error: txUpd } = await admin
          .from("transactions")
          .update({ money_status: "funds_pending_release", updated_at: new Date().toISOString() })
          .eq("id", txId)
          .eq("money_status", "funds_frozen");
        if (txUpd) throw txUpd;
        await admin.from("money_status_history").insert({
          transaction_id: txId,
          old_status: "funds_frozen",
          new_status: "funds_pending_release",
          changed_by_user_id: userId,
          reason,
        });
        await admin.from("admin_actions").insert({
          admin_user_id: userId,
          transaction_id: txId,
          action_type: "unfreeze_transaction",
          action_notes: reason,
        });
        await admin.from("audit_logs").insert({
          action: "admin_unfreeze",
          actor_user_id: userId,
          transaction_id: txId,
          description: `Admin unfroze ${tx.transaction_code}: ${reason}`,
        });
        return json({ ok: true });
      }

      case "flag_for_review": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("reason_min_8");
        if (["completed", "cancelled", "refunded", "timed_out"].includes(tx.status))
          return badRequest("Transaction is in a terminal state");

        const { error: rpcErr } = await admin.rpc("flag_for_release_review", {
          p_transaction_id: txId,
          p_reason: "manual_hold",
          p_actor_user_id: userId,
          p_notes: reason,
        });
        if (rpcErr) throw rpcErr;
        await admin.from("admin_actions").insert({
          admin_user_id: userId,
          transaction_id: txId,
          action_type: "flag_for_review",
          action_notes: reason,
        });
        await admin.from("audit_logs").insert({
          action: "admin_flag_review",
          actor_user_id: userId,
          transaction_id: txId,
          description: `Admin flagged ${tx.transaction_code} for review: ${reason}`,
        });
        return json({ ok: true });
      }

      case "escalate_dispute": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("reason_min_8");

        const { data: disputes } = await admin
          .from("disputes")
          .select("id, status")
          .eq("transaction_id", txId)
          .in("status", ACTIVE_DISPUTE)
          .limit(1);
        const active = disputes?.[0];

        // Allow if active dispute exists OR txn is otherwise marked as needing review
        if (!active && !tx.needs_release_review) {
          return badRequest("No active dispute");
        }

        if (active && active.status !== "under_review") {
          await admin.from("disputes").update({
            status: "under_review",
            updated_at: new Date().toISOString(),
          }).eq("id", active.id);
          await admin.from("dispute_status_history").insert({
            dispute_id: active.id,
            old_status: active.status,
            new_status: "under_review",
            changed_by_user_id: userId,
            reason,
          });
        }

        await admin.from("admin_actions").insert({
          admin_user_id: userId,
          transaction_id: txId,
          dispute_id: active?.id ?? null,
          action_type: "escalate_case",
          action_notes: reason,
        });
        await admin.from("audit_logs").insert({
          action: "admin_escalate_dispute",
          actor_user_id: userId,
          transaction_id: txId,
          description: `Admin escalated ${tx.transaction_code}: ${reason}`,
        });
        return json({ ok: true });
      }

      default:
        return badRequest("unknown_action");
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? "internal_error";
    return json({ error: msg }, 500);
  }
});