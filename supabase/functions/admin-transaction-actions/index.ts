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
  | "escalate_dispute"
  | "open_investigation"
  | "upsert_investigation";

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
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;
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
    .select("id, status, money_status, dispute_status, seller_id, buyer_confirmed_at, seller_confirmed_at, needs_release_review, transaction_code")
    .eq("id", txId)
    .single();
  if (txErr || !tx) return json({ error: "transaction_not_found" }, 404);

  try {
    switch (body.action) {
      case "add_internal_note": {
        const rawNote = String(payload.note ?? "").trim();
        if (rawNote.length < 5 || rawNote.length > 2000) return badRequest("Note must be between 5 and 2000 characters");
        const allowedTypes = ["note", "escalation", "risk", "payment", "dispute", "payout"];
        const allowedCategories = ["general","payment","escrow","dispute","delivery","evidence","payout","risk"];
        const rawCategory = String(payload.category ?? payload.note_type ?? "general");
        const category = allowedCategories.includes(rawCategory)
          ? rawCategory
          : (allowedTypes.includes(rawCategory) ? rawCategory : "general");
        const followUp = !!payload.follow_up_required;
        const followUpPriority = ["low","medium","high","urgent"].includes(String(payload.follow_up_priority ?? ""))
          ? String(payload.follow_up_priority) : null;
        const note = category === "general" ? rawNote : `[${category}] ${rawNote}`;
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
          metadata: { category, follow_up_required: followUp, follow_up_priority: followUpPriority },
        });
        await admin.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "admin_note_added",
          actor_user_id: userId,
          actor_role: "admin",
          event_data: { category, follow_up_required: followUp, follow_up_priority: followUpPriority },
        });
        if (followUp && !["completed","cancelled","refunded","timed_out"].includes(tx.status as string)) {
          await admin.rpc("flag_for_release_review", {
            p_transaction_id: txId,
            p_reason: "manual_hold",
            p_actor_user_id: userId,
            p_notes: `follow_up:${followUpPriority ?? "medium"} ${rawNote.slice(0,160)}`,
          });
        }
        return json({ ok: true });
      }

      case "freeze": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("Reason must be at least 8 characters");
        const category = String(payload.category ?? "manual_admin_review");
        const severity = ["low","medium","high","critical"].includes(String(payload.severity ?? ""))
          ? String(payload.severity) : "medium";
        if (tx.money_status === "funds_released" || tx.money_status === "refund_issued") {
          return badRequest("Funds already released; cannot be frozen");
        }
        if (tx.money_status === "funds_frozen") {
          return badRequest("Funds are already frozen");
        }
        if (!["funds_held_in_escrow","funds_pending_release"].includes(tx.money_status as string)) {
          return badRequest("Transaction is not eligible for freeze");
        }
        const { data: esc } = await admin
          .from("escrow_states")
          .select("held_amount, frozen_amount")
          .eq("transaction_id", txId)
          .maybeSingle();
        const heldNow = Number(esc?.held_amount ?? 0);
        if (heldNow <= 0) {
          return badRequest("No escrowed funds available to freeze");
        }

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
          action_notes: `[${category}/${severity}] ${reason}`,
        });
        await admin.from("audit_logs").insert({
          action: "admin_freeze",
          actor_user_id: userId,
          transaction_id: txId,
          description: `Admin froze ${tx.transaction_code}: ${reason}`,
          metadata: { category, severity, reason, note: payload.note ?? null },
        });
        await admin.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "admin_funds_frozen",
          actor_user_id: userId,
          actor_role: "admin",
          event_data: { category, severity, reason },
        });
        return json({ ok: true });
      }

      case "unfreeze": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("Reason must be at least 8 characters");
        if (tx.money_status !== "funds_frozen") {
          return badRequest("Funds are not currently frozen");
        }
        const target = String(payload.target_money_status ?? "");
        if (!["funds_held_in_escrow","funds_pending_release"].includes(target)) {
          return badRequest("Invalid target money status");
        }
        // If active dispute and target is pending release, require explicit acknowledgement
        if (target === "funds_pending_release") {
          const { data: openD } = await admin
            .from("disputes")
            .select("id, status")
            .eq("transaction_id", txId)
            .in("status", ACTIVE_DISPUTE)
            .limit(1);
          if ((openD ?? []).length > 0 && payload.acknowledge_open_dispute !== true) {
            return badRequest("Active dispute requires acknowledgement before moving to pending release");
          }
        }
        const { error: rpcErr } = await admin.rpc("unfreeze_funds_atomic", {
          p_transaction_id: txId,
          p_actor: userId,
          p_target: target,
          p_reason: reason,
        });
        if (rpcErr) throw rpcErr;
        await admin.from("admin_actions").insert({
          admin_user_id: userId,
          transaction_id: txId,
          action_type: "unfreeze_transaction",
          action_notes: `[target=${target}] ${reason}`,
        });
        await admin.from("audit_logs").insert({
          action: "admin_unfreeze",
          actor_user_id: userId,
          transaction_id: txId,
          description: `Admin unfroze ${tx.transaction_code}: ${reason}`,
          metadata: { target_money_status: target, reason, note: payload.note ?? null },
        });
        await admin.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "admin_funds_unfrozen",
          actor_user_id: userId,
          actor_role: "admin",
          event_data: { target_money_status: target, reason },
        });
        return json({ ok: true });
      }

      case "flag_for_review": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("Reason must be at least 8 characters");
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
        await admin.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "admin_flagged_for_review",
          actor_user_id: userId,
          actor_role: "admin",
          event_data: { reason },
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

      case "open_investigation": {
        const reason = String(payload.reason ?? "").trim() || "Investigation opened from transaction detail";
        // Back-compat path: delegate to upsert_investigation with default values
        return await handleUpsertInvestigation(admin, userId, txId, tx, {
          status: "open",
          priority: "medium",
          note: reason,
        });
      }

      case "upsert_investigation": {
        return await handleUpsertInvestigation(admin, userId, txId, tx, payload);
      }

      default:
        return badRequest("unknown_action");
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? "internal_error";
    return json({ error: msg }, 500);
  }
});

const VALID_INV_STATUS = ["open","under_review","escalated","resolved","dismissed"];
const VALID_INV_PRIORITY = ["low","medium","high","critical"];
const VALID_INV_TAGS = ["payment","dispute","delivery","user_risk","fraud_risk","evidence_conflict","payout_risk"];

async function handleUpsertInvestigation(admin: any, userId: string, txId: string, tx: any, payload: any) {
  const status = VALID_INV_STATUS.includes(String(payload.status ?? "")) ? String(payload.status) : "open";
  const priority = VALID_INV_PRIORITY.includes(String(payload.priority ?? "")) ? String(payload.priority) : "medium";
  const assigneeRaw = payload.assigned_admin_id ?? null;
  const assignee = typeof assigneeRaw === "string" && /^[0-9a-f-]{36}$/i.test(assigneeRaw) ? assigneeRaw : null;
  const tagsIn: string[] = Array.isArray(payload.tags) ? payload.tags : [];
  const tags = tagsIn.filter((t) => VALID_INV_TAGS.includes(t));
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  const { data: existing } = await admin
    .from("admin_investigations")
    .select("id, status, priority, assigned_admin_id, tags")
    .eq("transaction_id", txId)
    .maybeSingle();

  const isNew = !existing;
  const resolvedAt = ["resolved","dismissed"].includes(status) ? new Date().toISOString() : null;

  if (existing) {
    const { error } = await admin
      .from("admin_investigations")
      .update({
        status, priority,
        assigned_admin_id: assignee,
        tags,
        last_updated_by: userId,
        resolved_at: resolvedAt,
      })
      .eq("transaction_id", txId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("admin_investigations").insert({
      transaction_id: txId,
      status, priority,
      assigned_admin_id: assignee,
      tags,
      opened_by_user_id: userId,
      last_updated_by: userId,
      resolved_at: resolvedAt,
    });
    if (error) throw error;
  }

  if (note.length >= 1) {
    await admin.from("admin_transaction_notes").insert({
      transaction_id: txId,
      admin_user_id: userId,
      note: `[investigation] ${note.slice(0, 1900)}`,
    });
  }

  const actionType = isNew ? "open_investigation" : "update_investigation";
  await admin.from("admin_actions").insert({
    admin_user_id: userId,
    transaction_id: txId,
    action_type: actionType,
    action_notes: `${status}/${priority}${note ? ` :: ${note.slice(0, 240)}` : ""}`,
  });
  await admin.from("audit_logs").insert({
    action: isNew ? "admin_investigation_open" : "admin_investigation_update",
    actor_user_id: userId,
    transaction_id: txId,
    description: `${isNew ? "Opened" : "Updated"} investigation on ${tx.transaction_code}`,
    metadata: {
      status, priority, assigned_admin_id: assignee, tags,
      previous: existing ? {
        status: existing.status, priority: existing.priority,
        assigned_admin_id: existing.assigned_admin_id, tags: existing.tags,
      } : null,
    },
  });
  await admin.from("transaction_events").insert({
    transaction_id: txId,
    event_type: isNew ? "admin_investigation_opened" : "admin_investigation_updated",
    actor_user_id: userId,
    actor_role: "admin",
    event_data: { status, priority, tags, assigned_admin_id: assignee },
  });

  return json({ ok: true });
}