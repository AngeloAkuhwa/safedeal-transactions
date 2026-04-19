import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const txId = link.transaction_id;

    // 2. Fetch current transaction status
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .select("id, transaction_code, status, money_status, seller_id")
      .eq("id", txId)
      .single();

    if (txErr) throw txErr;

    // 3. Validate cancellable states
    const cancellableStatuses = ["draft", "awaiting_buyer", "awaiting_payment"];
    if (!cancellableStatuses.includes(tx.status)) {
      return new Response(
        JSON.stringify({ error: `Transaction cannot be cancelled in status: ${tx.status}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Update transaction status → cancelled
    const { error: updateErr } = await supabase
      .from("transactions")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", txId);

    if (updateErr) throw updateErr;

    // 5. Insert transaction_status_history record
    await supabase.from("transaction_status_history").insert({
      transaction_id: txId,
      old_status: tx.status,
      new_status: "cancelled",
      reason: "Buyer declined the transaction",
      changed_at: new Date().toISOString(),
    });

    // 6. Deactivate the share link
    await supabase
      .from("transaction_links")
      .update({ is_active: false })
      .eq("share_token", shareToken);

    // 6b. Release reserved stock for any source products on this transaction
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

    // 7. Notify the seller
    await supabase.from("notifications").insert({
      user_id: tx.seller_id,
      type: "transaction_update",
      channel: "in_app",
      title: "Transaction Declined",
      message: `Transaction ${tx.transaction_code} was declined by the buyer and has been cancelled.`,
      related_transaction_id: txId,
      status: "pending",
    });

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
