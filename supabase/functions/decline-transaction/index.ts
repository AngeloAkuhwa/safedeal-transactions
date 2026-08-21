import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CANCELLABLE_STATUSES,
  isShareLinkExpired,
  resolveCancelActorRole,
} from "../_shared/share-links.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 0. Auth. This function runs with verify_jwt = false, so validate in code.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { shareToken } = await req.json();
    if (!shareToken || typeof shareToken !== "string") {
      return new Response(JSON.stringify({ error: "shareToken is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const accessToken = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;
    const callerEmail = userData.user.email ?? null;

    // 1. Resolve share token → transaction
    const { data: link, error: linkErr } = await supabase
      .from("transaction_links")
      .select("transaction_id, expires_at, is_active")
      .eq("share_token", shareToken)
      .eq("is_active", true)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired transaction link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (isShareLinkExpired(link.expires_at)) {
      return new Response(
        JSON.stringify({ error: "This transaction link has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const txId = link.transaction_id;

    // 2. Fetch current transaction status
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .select("id, transaction_code, status, money_status, seller_id, buyer_id, buyer_contact_email")
      .eq("id", txId)
      .single();

    if (txErr) throw txErr;

    // 3. Ownership. Only the real parties may cancel, never a random link holder.
    const actorRole = resolveCancelActorRole(
      { userId: callerId, email: callerEmail },
      tx as { seller_id: string | null; buyer_id: string | null; buyer_contact_email: string | null },
    );
    if (!actorRole) {
      return new Response(
        JSON.stringify({ error: "You are not a party to this transaction" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validate cancellable states
    if (!(CANCELLABLE_STATUSES as readonly string[]).includes(tx.status)) {
      return new Response(
        JSON.stringify({ error: `Transaction cannot be cancelled in status: ${tx.status}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reason =
      actorRole === "seller"
        ? "Seller cancelled the transaction"
        : "Buyer declined the transaction";

    // 5. Update transaction status → cancelled (also stamp cancelled_at and
    //    transition money_status so the audit trail and ledger views line up)
    const nowIso = new Date().toISOString();
    const moneyShouldCancel =
      tx.money_status === "not_secured" || tx.money_status === "payment_pending";
    const { error: updateErr } = await supabase
      .from("transactions")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        ...(moneyShouldCancel ? { money_status: "cancelled" } : {}),
        updated_at: nowIso,
      })
      .eq("id", txId);

    if (updateErr) throw updateErr;

    // 6. Insert transaction_status_history record (and money_status_history
    //    when the money state also transitioned).
    await supabase.from("transaction_status_history").insert({
      transaction_id: txId,
      old_status: tx.status,
      new_status: "cancelled",
      reason,
      changed_by_user_id: callerId,
      changed_at: nowIso,
    });
    if (moneyShouldCancel) {
      await supabase.from("money_status_history").insert({
        transaction_id: txId,
        old_status: tx.money_status,
        new_status: "cancelled",
        reason,
        changed_by_user_id: callerId,
      });
    }

    // 7. Deactivate the share link
    await supabase
      .from("transaction_links")
      .update({ is_active: false })
      .eq("share_token", shareToken);

    // 7b. Release reserved stock for any source products on this transaction
    const { data: txItems } = await supabase
      .from("transaction_items")
      .select("quantity")
      .eq("transaction_id", txId);

    const { data: txWithProduct } = await supabase
      .from("transactions")
      .select("source_product_id")
      .eq("id", txId)
      .maybeSingle();

    const reservedQty = (txItems || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
    if (txWithProduct?.source_product_id && reservedQty > 0) {
      const { data: prod } = await supabase
        .from("products")
        .select("reserved_quantity, stock_quantity")
        .eq("id", txWithProduct.source_product_id)
        .single();

      if (prod) {
        const newReserved = Math.max(0, prod.reserved_quantity - reservedQty);
        await supabase
          .from("products")
          .update({ reserved_quantity: newReserved })
          .eq("id", txWithProduct.source_product_id);

        // Log release (idempotent on transaction)
        const { data: existingLog } = await supabase
          .from("product_inventory_logs")
          .select("id")
          .eq("product_id", txWithProduct.source_product_id)
          .eq("change_type", "release")
          .eq("reference_type", "transaction_declined")
          .eq("reference_id", txId)
          .maybeSingle();

        if (!existingLog) {
          await supabase.from("product_inventory_logs").insert({
            product_id: txWithProduct.source_product_id,
            change_type: "release",
            quantity_delta: -reservedQty,
            balance_after: prod.stock_quantity - newReserved,
            reference_type: "transaction_declined",
            reference_id: txId,
            notes: "Stock released after buyer declined transaction",
          });
        }
      }
    }

    // 8. Notify the counterparty
    const notifyUserId = actorRole === "seller" ? tx.buyer_id : tx.seller_id;
    if (notifyUserId) {
      await supabase.from("notifications").insert({
        user_id: notifyUserId,
        type: "transaction_update",
        channel: "in_app",
        title: actorRole === "seller" ? "Transaction Cancelled" : "Transaction Declined",
        message: `Transaction ${tx.transaction_code} was cancelled and is no longer active.`,
        related_transaction_id: txId,
        status: "pending",
      });
    }

    return new Response(
      JSON.stringify({ success: true, transaction_code: tx.transaction_code }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("decline-transaction error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
