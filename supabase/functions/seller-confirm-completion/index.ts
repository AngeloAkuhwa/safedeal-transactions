import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { formatMoney, PRICING_LINE_LABELS } from "../_shared/money-copy.ts";
import {
  PAYOUT_ACCOUNT_BLOCK_REASONS,
  PAYOUT_ACCOUNT_QUEUE_TYPE,
} from "../_shared/payout-blocking.ts";

const PAYOUT_ACCOUNT_MISSING = PAYOUT_ACCOUNT_BLOCK_REASONS[0];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Seller role required.
    const { data: roleCheck } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "seller")
      .maybeSingle();
    if (!roleCheck) {
      return jsonResponse({ error: "Forbidden: seller role required" }, 403);
    }

    let body: { transaction_id?: string; notes?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const transactionId = body.transaction_id;
    const notes = body.notes?.toString().slice(0, 500);
    if (!transactionId || typeof transactionId !== "string") {
      return jsonResponse({ error: "transaction_id is required" }, 400);
    }

    // Load transaction
    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select(
        "id, transaction_code, seller_id, buyer_id, status, money_status, dispute_status, buyer_confirmed_at, seller_confirmed_at",
      )
      .eq("id", transactionId)
      .maybeSingle();

    if (txErr) return jsonResponse({ error: txErr.message }, 500);
    if (!tx) return jsonResponse({ error: "Transaction not found" }, 404);
    if (tx.seller_id !== userId) {
      return jsonResponse({ error: "You are not the seller for this transaction" }, 403);
    }

    // Idempotency
    if (tx.seller_confirmed_at) {
      return jsonResponse({ already_confirmed: true, success: true });
    }

    // State guards
    if (tx.status !== "completed" || !tx.buyer_confirmed_at) {
      return jsonResponse(
        { error: "Buyer has not yet confirmed this transaction", code: "buyer_not_confirmed" },
        409,
      );
    }
    if (tx.dispute_status !== "none") {
      return jsonResponse({ error: "Transaction has an active dispute", code: "dispute_open" }, 409);
    }
    if (tx.money_status !== "funds_held_in_escrow") {
      return jsonResponse(
        { error: `Funds are not in escrow (current: ${tx.money_status})`, code: "wrong_money_state" },
        409,
      );
    }

    const now = new Date().toISOString();

    // Atomic flip with optimistic lock on money_status + seller_confirmed_at IS NULL.
    const { data: updated, error: updErr } = await admin
      .from("transactions")
      .update({
        seller_confirmed_at: now,
        money_status: "funds_pending_release",
      })
      .eq("id", transactionId)
      .eq("money_status", "funds_held_in_escrow")
      .is("seller_confirmed_at", null)
      .select("id")
      .maybeSingle();

    if (updErr) {
      if (updErr.message?.includes("Invalid money status transition")) {
        return jsonResponse({ error: updErr.message, code: "invalid_transition" }, 409);
      }
      return jsonResponse({ error: updErr.message }, 500);
    }
    if (!updated) {
      // Either already confirmed by a concurrent request, or money state moved.
      // Verify the prior call left a release_review_queue row. If not, the
      // first call crashed mid-side-effects. Self-heal by reporting back so
      // the caller can retry, rather than silently swallowing a failure.
      const { data: queueRow } = await admin
        .from("release_review_queue")
        .select("id, queue_type, status")
        .eq("transaction_id", transactionId)
        .in("status", ["pending", "claimed", "resolved"])
        .maybeSingle();

      if (queueRow) {
        return jsonResponse({
          already_confirmed: true,
          success: true,
          queue_type: queueRow.queue_type,
        });
      }

      // No queue row: the previous attempt did not finish. Re-read the
      // transaction so we know which side-effect branch to run, then fall
      // through to the safeguards below.
      const { data: refreshed } = await admin
        .from("transactions")
        .select("id, seller_id, buyer_id, money_status")
        .eq("id", transactionId)
        .maybeSingle();
      if (!refreshed) {
        return jsonResponse({ already_confirmed: true, success: true });
      }
      // Continue to the side-effect block below using the existing tx ref.
      // (tx is still in scope: refresh just confirms the current money state.)
    }

    // Audit + history (best-effort, parallel)
    await Promise.all([
      admin.from("transaction_completion_confirmations").upsert(
        {
          transaction_id: transactionId,
          confirmed_by_role: "seller",
          confirmed_by_user_id: userId,
          confirmed_at: now,
          notes: notes ?? null,
        },
        { onConflict: "transaction_id,confirmed_by_role", ignoreDuplicates: true },
      ),
      admin.from("money_status_history").insert({
        transaction_id: transactionId,
        old_status: "funds_held_in_escrow",
        new_status: "funds_pending_release",
        changed_by_user_id: userId,
        changed_at: now,
        reason: "Seller confirmed completion. Awaiting release review.",
      }),
      admin.from("transaction_events").insert({
        transaction_id: transactionId,
        event_type: "seller_confirmed_completion",
        actor_user_id: userId,
        actor_role: "seller",
        event_data: { action: "seller_confirm_completion" },
        occurred_at: now,
      }),
    ]);

    // ── Pricing safeguard ─────────────────────────────────────────────────
    const { data: pricing } = await admin
      .from("transaction_pricing")
      .select("seller_payout_amount, currency_code")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    // SafeDeal canonical payout amount = transaction_pricing.seller_payout_amount.
    const sellerNet =
      (pricing as any)?.seller_payout_amount != null
        ? Number((pricing as any).seller_payout_amount)
        : null;
    // A currency written into `payouts` / `release_review_queue` becomes a
    // financial record. We never invent one: a snapshot without a currency is
    // treated as missing pricing and routed to review with a null currency.
    const snapshotCurrency = pricing?.currency_code ?? null;
    if (!pricing || !snapshotCurrency || typeof sellerNet !== "number" || sellerNet <= 0) {
      await admin
        .from("transactions")
        .update({
          needs_release_review: true,
          release_review_reason: "pricing_missing",
        })
        .eq("id", transactionId);

      // Idempotent: partial unique index rrq_unique_open_per_type
      // prevents duplicate open rows per (transaction_id, queue_type).
      await admin.from("release_review_queue").insert({
        transaction_id: transactionId,
        payout_id: null,
        seller_id: tx.seller_id,
        amount: null,
        currency_code: snapshotCurrency,
        queue_type: "pricing_missing",
        status: "pending",
        notes: "Seller confirmed but pricing row missing or invalid.",
      }).then(({ error }) => {
        if (error && !/duplicate|unique/i.test(error.message ?? "")) {
          console.error("queue insert (pricing_missing) failed:", error);
        }
      });

      await admin.from("notifications").insert({
        user_id: tx.seller_id,
        type: "payment_update",
        channel: "in_app",
        title: "Confirmation recorded",
        message: "We've recorded your confirmation. SafeDeal is reviewing this transaction before release.",
        related_transaction_id: transactionId,
        status: "pending",
      });

      return jsonResponse({
        success: true,
        blocked: true,
        reason: "pricing_missing",
      });
    }

    // Past the guard the snapshot currency is known and non-null.
    const currency: string = snapshotCurrency;

    // ── Payout account safeguard ──────────────────────────────────────────
    const { data: payoutAccount } = await admin
      .from("v_payout_account_state")
      .select("account_id, verification_status, last_verified_at, account_state")
      .eq("user_id", tx.seller_id)
      .maybeSingle();

    if (!payoutAccount || (payoutAccount as any).account_state !== "verified_ready") {
      // Retry-stable id for the release commitment (never a timestamp).
      const { data: sellerConfirmation } = await admin
        .from("transaction_completion_confirmations")
        .select("id")
        .eq("transaction_id", transactionId)
        .eq("confirmed_by_role", "seller")
        .maybeSingle();
      // Create payout in blocked state, queue review.
      const { data: blockedPayout, error: payoutErr } = await admin
        .from("payouts")
        .insert({
          transaction_id: transactionId,
          seller_id: tx.seller_id,
          amount: sellerNet,
          currency_code: currency,
          status: "blocked",
          release_blocked: true,
          payout_blocked_reason: PAYOUT_ACCOUNT_MISSING,
          notes: "Both parties confirmed. Payout blocked: seller payout account missing.",
        })
        .select("id")
        .single();

      if (payoutErr) console.error("blocked payout insert failed:", payoutErr);

      await admin
        .from("transactions")
        .update({
          needs_release_review: true,
          release_review_reason: PAYOUT_ACCOUNT_MISSING,
        })
        .eq("id", transactionId);

      await admin.from("release_review_queue").insert({
        transaction_id: transactionId,
        payout_id: blockedPayout?.id ?? null,
        seller_id: tx.seller_id,
        amount: sellerNet,
        currency_code: currency,
        queue_type: PAYOUT_ACCOUNT_QUEUE_TYPE,
        status: "pending",
        notes: "Seller has no verified default payout account.",
      }).then(({ error }) => {
        if (error && !/duplicate|unique/i.test(error.message ?? "")) {
          console.error("queue insert (payout_account_missing) failed:", error);
        }
      });

      const { error: intentErr } = await admin.rpc("record_completion_release_intent_atomic", {
        p_transaction_id: transactionId,
        p_actor: userId,
        p_confirmation_id: sellerConfirmation?.id ?? null,
        p_payout_id: blockedPayout?.id ?? null,
        p_amount: sellerNet,
        p_currency: currency,
        p_entry_type: "payout_awaiting_release",
        p_notes:
          "Both parties confirmed. Payout blocked: seller payout account missing. No funds transferred.",
      });
      if (intentErr) console.error("release intent (blocked payout) failed:", intentErr);

      await admin.from("notifications").insert({
        user_id: tx.seller_id,
        type: "payment_update",
        channel: "in_app",
        title: "Add a payout account to receive funds",
        message:
          "Both parties confirmed this deal. Add or verify your payout account so SafeDeal can release your funds.",
        related_transaction_id: transactionId,
        status: "pending",
        metadata: { action: "add_payout_account", deep_link: "/seller/profile" },
      });

      return jsonResponse({
        success: true,
        blocked: true,
        reason: PAYOUT_ACCOUNT_MISSING,
        payout_id: blockedPayout?.id ?? null,
      });
    }

    // ── Happy path ────────────────────────────────────────────────────────
    const { data: sellerConfirmationRow } = await admin
      .from("transaction_completion_confirmations")
      .select("id")
      .eq("transaction_id", transactionId)
      .eq("confirmed_by_role", "seller")
      .maybeSingle();

    const { data: payout, error: payoutErr } = await admin
      .from("payouts")
      .insert({
        transaction_id: transactionId,
        seller_id: tx.seller_id,
        amount: sellerNet,
        currency_code: currency,
        status: "awaiting_release",
        notes: "Both parties confirmed. Awaiting release review.",
      })
      .select("id")
      .single();

    if (payoutErr || !payout) {
      console.error("payout insert failed:", payoutErr);
      return jsonResponse({
        success: true,
        warning: "payout_record_failed",
        message: payoutErr?.message ?? "Could not create payout record",
      });
    }

    await Promise.all([
      // Commitment only: never a debit. Guarded + idempotent on the confirmation id.
      admin.rpc("record_completion_release_intent_atomic", {
        p_transaction_id: transactionId,
        p_actor: userId,
        p_confirmation_id: sellerConfirmationRow?.id ?? null,
        p_payout_id: payout.id,
        p_amount: sellerNet,
        p_currency: currency,
        p_entry_type: "payout_awaiting_release",
        p_notes:
          "Both parties confirmed. Payout moved to Awaiting Release. No funds transferred yet.",
      }).then(({ error }) => {
        if (error) console.error("release intent failed:", error);
      }),
      admin.from("release_review_queue").insert({
        transaction_id: transactionId,
        payout_id: payout.id,
        seller_id: tx.seller_id,
        amount: sellerNet,
        currency_code: currency,
        queue_type: "ready_for_release",
        status: "pending",
        notes: "Both parties confirmed. Ready for release review.",
      }).then(({ error }) => {
        if (error && !/duplicate|unique/i.test(error.message ?? "")) {
          console.error("queue insert (ready_for_release) failed:", error);
        }
      }),
      admin.from("notifications").insert({
        user_id: tx.seller_id,
        type: "payment_update",
        channel: "in_app",
        title: "Confirmation recorded",
        message: `Confirmation recorded. SafeDeal will review and release your ${PRICING_LINE_LABELS.seller_payout_amount} of ${formatMoney(
          sellerNet,
          currency,
        )} shortly.`,
        related_transaction_id: transactionId,
        status: "pending",
      }),
      tx.buyer_id
        ? admin.from("notifications").insert({
            user_id: tx.buyer_id,
            type: "payment_update",
            channel: "in_app",
            title: "Both parties confirmed",
            message: "Both parties have confirmed this deal. SafeDeal will process the release.",
            related_transaction_id: transactionId,
            status: "pending",
          })
        : Promise.resolve(),
    ]);

    return jsonResponse({
      success: true,
      payout_id: payout.id,
      money_status: "funds_pending_release",
      queue_type: "ready_for_release",
    });
  } catch (err) {
    console.error("seller-confirm-completion error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});