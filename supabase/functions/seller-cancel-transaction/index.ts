import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CANCELLABLE = new Set(["draft", "awaiting_buyer", "awaiting_payment"]);
const SAFE_MONEY = new Set(["not_secured", "payment_pending"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, srk);
    const token = auth.slice(7);
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "Invalid session" }, 401);
    const userId = u.user.id;

    const body = await req.json().catch(() => null);
    const txId: string | undefined = body?.transaction_id;
    const reason: string = (body?.reason ?? "").toString().slice(0, 500);
    if (!txId || typeof txId !== "string") return json({ error: "transaction_id required" }, 400);

    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select("id, seller_id, buyer_id, status, money_status, source_product_id")
      .eq("id", txId)
      .maybeSingle();
    if (txErr || !tx) return json({ error: "Transaction not found" }, 404);
    if (tx.seller_id !== userId) return json({ error: "Forbidden" }, 403);

    if (!CANCELLABLE.has(tx.status)) {
      return json({ error: "not_cancellable", current_status: tx.status }, 409);
    }
    if (!SAFE_MONEY.has(tx.money_status)) {
      return json({ error: "money_not_safe", current_money_status: tx.money_status }, 409);
    }

    const oldMoney = tx.money_status as string;
    const newMoney = "not_secured";
    const moneyChanged = oldMoney !== newMoney;

    // Optimistic-locked status transition
    const updateRes = await admin
      .from("transactions")
      .update({
        status: "cancelled",
        money_status: newMoney,
        cancellation_reason: "seller_cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", txId)
      .eq("status", tx.status)
      .eq("money_status", oldMoney)
      .select("id")
      .maybeSingle();
    if (updateRes.error || !updateRes.data) {
      return json({ error: "state_conflict" }, 409);
    }

    // History
    await admin.from("transaction_status_history").insert({
      transaction_id: txId,
      old_status: tx.status,
      new_status: "cancelled",
      changed_by_user_id: userId,
      reason: `seller_cancelled${reason ? `: ${reason}` : ""}`,
    });
    if (moneyChanged) {
      await admin.from("money_status_history").insert({
        transaction_id: txId,
        old_status: oldMoney,
        new_status: newMoney,
        changed_by_user_id: userId,
        reason: "seller_cancelled",
      });
    }
    await admin.from("transaction_events").insert({
      transaction_id: txId,
      event_type: "auto_cancelled",
      event_data: { reason: "seller_cancelled", note: reason || null },
    });

    // Revoke open links
    await admin
      .from("transaction_links")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("transaction_id", txId)
      .eq("is_active", true);

    // Release reserved stock
    if (tx.source_product_id) {
      const { data: items } = await admin
        .from("transaction_items")
        .select("quantity")
        .eq("transaction_id", txId);
      const qty = (items ?? []).reduce(
        (s: number, r: { quantity: number | null }) => s + (r.quantity ?? 0),
        0,
      );
      if (qty > 0) {
        const { data: prod } = await admin
          .from("products")
          .select("reserved_quantity")
          .eq("id", tx.source_product_id)
          .maybeSingle();
        const newReserved = Math.max(0, (prod?.reserved_quantity ?? 0) - qty);
        await admin
          .from("products")
          .update({ reserved_quantity: newReserved, updated_at: new Date().toISOString() })
          .eq("id", tx.source_product_id);
        await admin.from("product_inventory_logs").insert({
          product_id: tx.source_product_id,
          change_type: "release",
          quantity_delta: qty,
          balance_after: newReserved,
          reference_type: "seller_cancellation",
          reference_id: txId,
          notes: "seller_cancelled",
        });
      }
    }

    // Notify buyer
    if (tx.buyer_id) {
      await admin.from("notifications").insert({
        user_id: tx.buyer_id,
        type: "transaction_update",
        channel: "in_app",
        title: "Transaction cancelled by seller",
        message: "The seller cancelled this transaction before payment was completed.",
        related_transaction_id: txId,
        status: "pending",
      });
    }

    return json({ ok: true });
  } catch (e) {
    console.error("seller-cancel-transaction error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
