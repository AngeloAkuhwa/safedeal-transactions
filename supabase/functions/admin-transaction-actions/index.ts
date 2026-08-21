import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireAdmin, requireAnyPermission, authErrorResponse, type AuthContext } from "../_shared/auth.ts";
import { notifyUser } from "../_shared/notify.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";
import { executeProviderRefund } from "../_shared/provider-refund.ts";

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

// Small helper to consolidate the legacy `admin_actions` + `audit_logs` double-insert
// pattern into a single unified audit call via logAdminAction (Batch D).
type AuditOpts = {
  admin: any;
  actorId: string;
  action: string;
  transactionId?: string | null;
  disputeId?: string | null;
  targetUserId?: string | null;
  reason?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};
async function recordAdmin(o: AuditOpts) {
  await logAdminAction(o.admin, {
    actorId: o.actorId,
    action: o.action,
    targetType: o.targetUserId ? "user" : (o.disputeId ? "dispute" : "transaction"),
    targetId: o.targetUserId ?? o.disputeId ?? o.transactionId ?? null,
    transactionId: o.transactionId ?? null,
    disputeId: o.disputeId ?? null,
    reason: o.reason,
    before: o.before,
    after: o.after,
    metadata: o.metadata,
    mirrorToAuditLogs: true,
    ip: o.ip,
    userAgent: o.userAgent,
  });
}

type ActionName =
  | "add_internal_note"
  | "freeze"
  | "unfreeze"
  | "flag_for_review"
  | "escalate_dispute"
  | "open_investigation"
  | "upsert_investigation"
  | "resolve_dispute"
  | "dispute_request_more_info"
  | "retry_dispute_refund"
  | "block_payout"
  | "unblock_payout";

interface Body {
  action: ActionName;
  transactionId: string;
  payload?: Record<string, unknown>;
}

// Fine-grained gates per admin action. Each action gets a set of accepted
// permission keys; requireAnyPermission passes if the caller holds any of
// them (or is a super role).
const ACTION_PERMS: Record<string, string[]> = {
  add_internal_note:         ["disputes.add_internal_note", "transactions.update"],
  freeze:                    ["transactions.update"],
  unfreeze:                  ["transactions.update"],
  flag_for_review:           ["transactions.update", "flagged_users.update"],
  escalate_dispute:          ["disputes.escalate"],
  open_investigation:        ["transactions.update"],
  upsert_investigation:      ["transactions.update"],
  // Money-movement dispute outcomes: high-authority roles bypass the
  // per-agent cap; `resolve_assigned` holders (support/dispute agents)
  // may resolve only when the transaction passes the escalation policy
  // enforced inside the branch below.
  resolve_dispute:           ["disputes.resolve_all", "financial_controls.approve", "disputes.resolve_assigned"],
  dispute_request_more_info: ["disputes.request_information"],
  // Re-runs the Paystack hand-off for a dispute refund that is still stuck in
  // 'pending'/'failed' while the transaction sits at money_status
  // 'refund_pending'. Money movement — finance authority only.
  retry_dispute_refund:      ["refunds.issue"],
  block_payout:              ["transactions.update", "financial_controls.approve"],
  unblock_payout:            ["transactions.update", "financial_controls.approve"],
};
async function gateAction(
  req: Request,
  action: string,
  existing?: AuthContext,
): Promise<{ admin: any; userId: string } | Response> {
  const perms = ACTION_PERMS[action] ?? ["transactions.update"];
  try {
    const ctx = await requireAnyPermission(req, perms, existing);
    return { admin: ctx.adminClient, userId: ctx.userId };
  } catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }
}

function badRequest(msg: string) {
  return json({ error: msg }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });


  // Establish WHO is calling before reading WHAT they sent.
  //
  // The specific permission depends on `body.action`, so the fine-grained
  // check genuinely cannot run until the body is parsed. The coarse one can,
  // and must: parsing first meant an anonymous caller got `missing_fields`,
  // and by varying the body could map which actions exist, which are refused
  // outright, and which are merely unauthorised — a free index of the admin
  // surface, answered by a function that never learned their name.
  let baseCtx: AuthContext;
  try {
    baseCtx = await requireAdmin(req);
  } catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    // Not an AuthError. Rethrowing would escape Deno.serve and produce a bare
    // runtime 500 with no CORS headers, so the admin UI would show a CORS
    // failure instead of the actual problem — and this now runs on every
    // request rather than only after the body parsed, so it is a hotter path
    // than it was.
    console.error("[admin-transaction-actions] auth failed", err);
    return json({ error: "auth_failed" }, 500);
  }

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

  const gated = await gateAction(req, body.action, baseCtx);
  if (gated instanceof Response) return gated;
  const { admin, userId } = gated;
  const txId = body.transactionId;
  const payload = (body.payload ?? {}) as Record<string, any>;
  const _meta = extractRequestMeta(req);

  // Load transaction snapshot
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, status, money_status, dispute_status, seller_id, buyer_confirmed_at, seller_confirmed_at, needs_release_review, needs_admin_review, transaction_code, transaction_pricing(buyer_total_amount)")
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
        await recordAdmin({ admin, actorId: userId, action: "add_internal_note", transactionId: txId,
          reason: note.slice(0, 500),
          metadata: { category, follow_up_required: followUp, follow_up_priority: followUpPriority, transaction_code: tx.transaction_code },
          ip: _meta.ip, userAgent: _meta.userAgent });
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
        await recordAdmin({ admin, actorId: userId, action: "freeze_transaction", transactionId: txId,
          reason,
          before: { money_status: tx.money_status },
          after: { money_status: "funds_frozen" },
          metadata: { category, severity, note: payload.note ?? null, transaction_code: tx.transaction_code },
          ip: _meta.ip, userAgent: _meta.userAgent });
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
        // Look up active dispute (used for ack on pending_release + response payload)
        const { data: openD } = await admin
          .from("disputes")
          .select("id, status")
          .eq("transaction_id", txId)
          .in("status", ACTIVE_DISPUTE)
          .limit(1);
        const hasActiveDispute = (openD ?? []).length > 0;
        if (target === "funds_pending_release" && hasActiveDispute && payload.acknowledge_open_dispute !== true) {
          return badRequest("Active dispute requires acknowledgement before moving to pending release");
        }
        // Pre-read frozen amount for response
        const { data: escPre } = await admin
          .from("escrow_states")
          .select("frozen_amount")
          .eq("transaction_id", txId)
          .maybeSingle();
        const movedAmount = Number(escPre?.frozen_amount ?? 0);

        const { error: rpcErr } = await admin.rpc("unfreeze_funds_atomic", {
          p_transaction_id: txId,
          p_actor: userId,
          p_target: target,
          p_reason: reason,
        });
        if (rpcErr) throw rpcErr;
        await recordAdmin({ admin, actorId: userId, action: "unfreeze_transaction", transactionId: txId,
          reason,
          before: { money_status: "funds_frozen" },
          after: { money_status: target },
          metadata: { target_money_status: target, note: payload.note ?? null, moved_amount: movedAmount, transaction_code: tx.transaction_code },
          ip: _meta.ip, userAgent: _meta.userAgent });
        await admin.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "admin_funds_unfrozen",
          actor_user_id: userId,
          actor_role: "admin",
          event_data: { target_money_status: target, reason, moved_amount: movedAmount },
        });

        // Optional neutral notifications
        if (payload.notify_parties === true) {
          const { data: parties } = await admin
            .from("transactions")
            .select("buyer_id, seller_id, transaction_code")
            .eq("id", txId)
            .single();
          const recipients = [parties?.buyer_id, parties?.seller_id].filter(Boolean) as string[];
          await Promise.all(recipients.map((uid) =>
            notifyUser(admin, {
              user_id: uid,
              type: "transaction_update",
              title: "Transaction status updated",
              message: "The transaction review status has been updated. Funds remain protected while the transaction continues.",
              related_transaction_id: txId,
              metadata: { transaction_code: parties?.transaction_code, neutral: true },
            })
          ));
        }

        return json({ ok: true, target, moved_amount: movedAmount, active_dispute: hasActiveDispute });
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
        await recordAdmin({ admin, actorId: userId, action: "flag_for_review", transactionId: txId,
          reason,
          metadata: { transaction_code: tx.transaction_code },
          ip: _meta.ip, userAgent: _meta.userAgent });
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

        await recordAdmin({ admin, actorId: userId, action: "escalate_case", transactionId: txId,
          disputeId: active?.id ?? null,
          reason,
          before: active ? { status: active.status } : undefined,
          after: active ? { status: "under_review" } : undefined,
          metadata: { transaction_code: tx.transaction_code },
          ip: _meta.ip, userAgent: _meta.userAgent });
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

      case "resolve_dispute": {
        const allowedOutcomes = [
          "refund_buyer",
          "release_funds_to_seller",
          "partial_refund_release",
          "dismissed_seller_favor",
          "dismissed_buyer_favor",
          "close_case_without_resolution",
        ];
        const outcome = String(payload.outcome_type ?? "");
        if (!allowedOutcomes.includes(outcome)) return badRequest("invalid_outcome");
        const summary = String(payload.decision_summary ?? "").trim();
        if (summary.length < 10 || summary.length > 4000) return badRequest("Decision summary must be 10–4000 characters");
        const refundAmount = Number(payload.refund_amount ?? 0);
        const releaseAmount = Number(payload.release_amount ?? 0);
        if (!Number.isFinite(refundAmount) || refundAmount < 0) return badRequest("invalid_refund_amount");
        if (!Number.isFinite(releaseAmount) || releaseAmount < 0) return badRequest("invalid_release_amount");

        // ---- Escalation policy (Support Agent RBAC finalisation) --------
        // Callers with `disputes.resolve_all` or `financial_controls.approve`
        // bypass the cap. Callers with only `disputes.resolve_assigned`
        // (e.g. support/dispute agents) must escalate when the transaction
        // is high-risk, compliance-flagged, or above the configured cap.
        try {
          const { data: heldRaw } = await admin.rpc(
            "internal_effective_permissions",
            { _user_id: userId },
          );
          const held = new Set(Array.isArray(heldRaw) ? (heldRaw as string[]) : []);
          const isSuperResolver =
            held.has("disputes.resolve_all") || held.has("financial_controls.approve");
          if (!isSuperResolver) {
            // Load cap from platform settings; default ₦500,000.
            let cap = 500_000;
            try {
              const { data: setRows } = await admin.rpc("get_effective_settings", {
                _vendor_id: tx.seller_id,
                _keys: ["dispute.support_agent_resolution_cap_ngn"],
              });
              const row = (setRows as Array<{ setting_key: string; setting_value: unknown }> | null)
                ?.find((r) => r.setting_key === "dispute.support_agent_resolution_cap_ngn");
              const raw = row?.setting_value;
              const n = typeof raw === "string" ? Number(raw) : (raw as number);
              if (Number.isFinite(n) && n > 0) cap = n;
            } catch { /* fallback to default */ }

            const pricing = (tx as any).transaction_pricing;
            const pricingRow = Array.isArray(pricing) ? pricing[0] : pricing;
            const amount = Number(pricingRow?.buyer_total_amount ?? 0);
            const escalationReasons: string[] = [];
            if (tx.needs_admin_review) escalationReasons.push("high_risk_flag");
            if (amount > cap) escalationReasons.push(`amount_over_cap:${cap}`);
            // Money-movement outcomes require approver on any non-trivial value.
            const movesMoney =
              outcome === "refund_buyer" ||
              outcome === "release_funds_to_seller" ||
              outcome === "partial_refund_release";
            if (movesMoney && (refundAmount > cap || releaseAmount > cap)) {
              escalationReasons.push(`outcome_amount_over_cap:${cap}`);
            }
            if (escalationReasons.length > 0) {
              // This is an expected business-rule denial, not a transport/auth failure.
              // Return 200 so the preview/runtime monitor does not classify the handled
              // support-agent escalation path as a blank-screen edge-function crash.
              return json({
                ok: false,
                error: "escalation_required",
                reasons: escalationReasons,
                cap_ngn: cap,
              }, 200);
            }
          }
        } catch (e) {
          console.error("[resolve_dispute] escalation policy check failed", e);
          // Fail closed for non-super resolvers.
          return json({ error: "escalation_policy_check_failed" }, 500);
        }
        // -----------------------------------------------------------------

        const notifyParties = payload.notify_parties === true;
        const alsoCloseInvestigation = payload.also_close_investigation === true;
        const acknowledgeFrozenFunds = payload.acknowledge_frozen_funds === true;
        const internalNote = typeof payload.internal_note === "string" ? payload.internal_note.trim() : "";

        const { data: disputeRow } = await admin
          .from("disputes")
          .select("id, status")
          .eq("transaction_id", txId)
          .in("status", ACTIVE_DISPUTE)
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!disputeRow) return json({ error: "no_active_dispute" }, 409);

        const { data: rpc, error: rpcErr } = await admin.rpc("resolve_dispute_atomic", {
          p_dispute_id: disputeRow.id,
          p_actor: userId,
          p_outcome: outcome,
          p_refund_amount: Math.round(refundAmount * 100) / 100,
          p_release_amount: Math.round(releaseAmount * 100) / 100,
          p_decision_summary: summary,
          p_also_close_investigation: alsoCloseInvestigation,
          p_acknowledge_frozen_funds: acknowledgeFrozenFunds,
        });
        if (rpcErr) {
          const msg = String(rpcErr.message ?? "");
          if (msg.includes("already_resolved")) return json({ error: "already_resolved" }, 409);
          if (msg.includes("frozen_funds_acknowledgement_required")) {
            return json({ error: "frozen_funds_acknowledgement_required" }, 400);
          }
          if (msg.startsWith("invalid_") || msg.startsWith("partial_") || msg.startsWith("no_")) return badRequest(msg);
          throw rpcErr;
        }
        if (rpc && (rpc as any).ok === false && (rpc as any).code === "already_resolved") {
          return json({ error: "already_resolved" }, 409);
        }

        // Sync the linked orchestration task (if any) with the dispute
        // resolution so the Task Orchestration board stays in step.
        try {
          const { data: linkedTask } = await admin
            .from("orchestration_tasks")
            .select("id, status")
            .eq("dispute_id", disputeRow.id)
            .not("status", "in", "(resolved,closed,cancelled)")
            .maybeSingle();
          if (linkedTask?.id) {
            await admin.rpc("complete_orchestration_task", {
              _task_id: linkedTask.id,
              _resolution: `dispute_${outcome}`,
              _actor_id: userId,
            });
          }
        } catch (e) {
          console.warn("[resolve_dispute] orchestration task sync skipped:", e);
        }

        if (internalNote.length > 0) {
          await admin.from("admin_transaction_notes").insert({
            transaction_id: txId,
            admin_user_id: userId,
            note: `[dispute:${outcome}] ${internalNote.slice(0, 1900)}`,
          });
        }

        if (notifyParties) {
          const { data: parties } = await admin
            .from("transactions")
            .select("buyer_id, seller_id, transaction_code")
            .eq("id", txId)
            .single();
          const message =
            outcome === "release_funds_to_seller" || outcome === "dismissed_seller_favor"
              ? "The dispute has been resolved. The transaction is now awaiting release review."
              : outcome === "refund_buyer" || outcome === "dismissed_buyer_favor"
              ? "The dispute has been resolved. A refund process has been started."
              : outcome === "partial_refund_release"
              ? "The dispute has been resolved with a partial refund/release decision."
              : "The dispute case has been closed. The transaction will continue based on its current state.";
          const recipients = [parties?.buyer_id, parties?.seller_id].filter(Boolean) as string[];
          await Promise.all(recipients.map((uid) =>
            notifyUser(admin, {
              user_id: uid,
              type: "dispute_update",
              title: "Dispute resolution update",
              message,
              related_transaction_id: txId,
              metadata: { transaction_code: parties?.transaction_code, outcome, neutral: true },
            })
          ));
        }

        // ---- Execute the money movement ---------------------------------
        // `resolve_dispute_atomic` only books the refund row + ledger state;
        // nothing in the DB talks to Paystack. Without this call the buyer is
        // never actually refunded and the transaction sits at
        // money_status='refund_pending' forever.
        const REFUND_OUTCOMES = ["refund_buyer", "dismissed_buyer_favor", "partial_refund_release"];
        let refundExecution: Record<string, unknown> = {};
        const rpcRefundId = (rpc as any)?.refund_id as string | null | undefined;
        if (REFUND_OUTCOMES.includes(outcome) && rpcRefundId) {
          const exec = await executeProviderRefund(admin, rpcRefundId, {
            reason: `dispute_${outcome}`,
            notes: summary.slice(0, 400),
            actor_user_id: userId,
          });
          if (exec.ok) {
            refundExecution = {
              refund_execution: exec.idempotent ? "idempotent" : "processing",
              refund_provider_reference: exec.provider_reference,
            };
          } else {
            // The dispute IS resolved — report success for the resolution but
            // surface the money-movement failure. fail_refund_atomic + the ops
            // alert already fired inside the helper; an admin with
            // `refunds.issue` can re-run it via `retry_dispute_refund`.
            console.error("[resolve_dispute] provider refund failed", exec.error, exec.message);
            refundExecution = {
              refund_execution: "failed",
              refund_execution_reason: exec.message ?? exec.error,
            };
          }
        }

        return json({ ok: true, ...(rpc ?? {}), ...refundExecution });
      }

      case "retry_dispute_refund": {
        if (tx.money_status !== "refund_pending") {
          return json({ error: "not_in_refund_pending", money_status: tx.money_status }, 409);
        }
        const { data: refundRow } = await admin
          .from("refunds")
          .select("id, status, refund_amount")
          .eq("transaction_id", txId)
          .in("status", ["pending", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!refundRow?.id) return json({ error: "no_retryable_refund" }, 409);

        const exec = await executeProviderRefund(admin, refundRow.id as string, {
          reason: "dispute_refund_retry",
          notes: typeof payload.notes === "string" ? payload.notes.slice(0, 400) : null,
          actor_user_id: userId,
        });

        await recordAdmin({
          admin,
          actorId: userId,
          action: "retry_refund",
          transactionId: txId,
          reason: typeof payload.notes === "string" ? payload.notes : undefined,
          metadata: {
            refund_id: refundRow.id,
            previous_status: refundRow.status,
            result: exec.ok ? "processing" : "failed",
            error: exec.ok ? null : (exec.message ?? exec.error),
          },
          ..._meta,
        });

        if (!exec.ok) {
          return json({ error: exec.error, message: exec.message ?? null, refund_id: refundRow.id }, 502);
        }
        return json({
          ok: true,
          refund_id: exec.refund_id,
          idempotent: exec.idempotent,
          provider_reference: exec.provider_reference,
          amount: exec.amount,
          status: exec.status,
        });
      }

      case "dispute_request_more_info": {
        const message = String(payload.message ?? "").trim();
        if (message.length < 10 || message.length > 2000) return badRequest("Message must be 10–2000 characters");
        const newDueAt = String(payload.new_due_at ?? "");
        const parsedDue = newDueAt ? new Date(newDueAt) : null;
        if (!parsedDue || isNaN(parsedDue.getTime()) || parsedDue.getTime() <= Date.now()) {
          return badRequest("new_due_at must be a future ISO date");
        }
        const { data: disputeRow } = await admin
          .from("disputes")
          .select("id, status")
          .eq("transaction_id", txId)
          .in("status", ACTIVE_DISPUTE)
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!disputeRow) return json({ error: "no_active_dispute" }, 409);

        const { data: rpc, error: rpcErr } = await admin.rpc("dispute_request_more_info_atomic", {
          p_dispute_id: disputeRow.id,
          p_actor: userId,
          p_new_due_at: parsedDue.toISOString(),
          p_message: message,
        });
        if (rpcErr) throw rpcErr;
        if (rpc && (rpc as any).ok === false && (rpc as any).code === "already_resolved") {
          return json({ error: "already_resolved" }, 409);
        }

        if (payload.notify_seller === true) {
          const { data: parties } = await admin
            .from("transactions")
            .select("seller_id, transaction_code")
            .eq("id", txId)
            .single();
          if (parties?.seller_id) {
            await notifyUser(admin, {
              user_id: parties.seller_id,
              type: "dispute_update",
              title: "Additional information requested",
              message: "An admin requested more information about your dispute. Please review the case.",
              related_transaction_id: txId,
              metadata: { transaction_code: parties.transaction_code, new_due_at: parsedDue.toISOString() },
            });
          }
        }

        return json({ ok: true });
      }

      case "block_payout": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("Reason must be at least 8 characters");
        const payoutIdRaw = String(payload.payout_id ?? "").trim();
        let query = admin.from("payouts").select("id, status, release_blocked").eq("transaction_id", txId);
        if (payoutIdRaw) query = query.eq("id", payoutIdRaw);
        const { data: payouts, error: pErr } = await query;
        if (pErr) throw pErr;
        if (!payouts || payouts.length === 0) return json({ error: "no_payout" }, 404);
        const target = payoutIdRaw ? payouts[0] : (payouts.find((p: any) => !p.release_blocked) ?? payouts[0]);
        if (target.release_blocked) return badRequest("Payout already blocked");
        const { error: updErr } = await admin
          .from("payouts")
          .update({ release_blocked: true, payout_blocked_reason: reason.slice(0, 240), updated_at: new Date().toISOString() })
          .eq("id", target.id);
        if (updErr) throw updErr;
        await admin.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "payout_blocked",
          actor_user_id: userId,
          actor_role: "admin",
          event_data: { payout_id: target.id, reason },
        });
        await recordAdmin({ admin, actorId: userId, action: "block_payout", transactionId: txId,
          reason,
          before: { release_blocked: false },
          after: { release_blocked: true, payout_blocked_reason: reason.slice(0, 240) },
          metadata: { payout_id: target.id, transaction_code: tx.transaction_code },
          ip: _meta.ip, userAgent: _meta.userAgent });
        return json({ ok: true, payout_id: target.id });
      }

      case "unblock_payout": {
        const reason = String(payload.reason ?? "").trim();
        if (reason.length < 8) return badRequest("Reason must be at least 8 characters");
        const payoutIdRaw = String(payload.payout_id ?? "").trim();
        let query = admin.from("payouts").select("id, status, release_blocked, payout_blocked_reason").eq("transaction_id", txId);
        if (payoutIdRaw) query = query.eq("id", payoutIdRaw);
        const { data: payouts, error: pErr } = await query;
        if (pErr) throw pErr;
        if (!payouts || payouts.length === 0) return json({ error: "no_payout" }, 404);
        const target = payoutIdRaw ? payouts[0] : (payouts.find((p: any) => p.release_blocked) ?? payouts[0]);
        if (!target.release_blocked) return badRequest("Payout is not blocked");
        const previousReason = target.payout_blocked_reason ?? null;
        const { error: updErr } = await admin
          .from("payouts")
          .update({ release_blocked: false, payout_blocked_reason: null, updated_at: new Date().toISOString() })
          .eq("id", target.id);
        if (updErr) throw updErr;
        await admin.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "payout_unblocked",
          actor_user_id: userId,
          actor_role: "admin",
          event_data: { payout_id: target.id, reason, previous_reason: previousReason },
        });
        await recordAdmin({ admin, actorId: userId, action: "unblock_payout", transactionId: txId,
          reason,
          before: { release_blocked: true, payout_blocked_reason: previousReason },
          after: { release_blocked: false, payout_blocked_reason: null },
          metadata: { payout_id: target.id, transaction_code: tx.transaction_code },
          ip: _meta.ip, userAgent: _meta.userAgent });
        return json({ ok: true, payout_id: target.id });
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
  await logAdminAction(admin, {
    actorId: userId,
    action: actionType,
    targetType: "transaction",
    targetId: txId,
    transactionId: txId,
    reason: note ? note.slice(0, 240) : undefined,
    before: existing ? {
      status: existing.status, priority: existing.priority,
      assigned_admin_id: existing.assigned_admin_id, tags: existing.tags,
    } : undefined,
    after: { status, priority, assigned_admin_id: assignee, tags },
    metadata: { transaction_code: tx.transaction_code },
    mirrorToAuditLogs: true,
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