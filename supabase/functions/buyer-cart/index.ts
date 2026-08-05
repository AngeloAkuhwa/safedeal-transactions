import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const buyerId = userData.user.id;

    // Verify buyer role
    const { data: hasBuyer } = await admin.rpc("has_role", { _user_id: buyerId, _role: "buyer" });
    if (!hasBuyer) return json({ error: "Buyer role required" }, 403);

    // ── GET: list cart items ──
    if (req.method === "GET") {
      const { data: cartItems, error: cartErr } = await admin
        .from("cart_items")
        .select("id, product_id, quantity, created_at, updated_at")
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: false });

      if (cartErr) throw cartErr;
      if (!cartItems || cartItems.length === 0) {
        return json({ items: [], count: 0 });
      }

      const productIds = cartItems.map((ci: any) => ci.product_id);

      // Fetch products with primary media
      const { data: products } = await admin
        .from("products")
        .select("id, title, slug, unit_price, currency_code, stock_quantity, reserved_quantity, status, is_active, visibility_type, seller_id, short_description, delivery_method")
        .in("id", productIds);

      // Fetch primary media for these products
      const { data: mediaRows } = await admin
        .from("product_media")
        .select("product_id, file_id, files(file_url)")
        .in("product_id", productIds)
        .eq("is_primary", true);

      // Fetch seller names
      const sellerIds = [...new Set((products || []).map((p: any) => p.seller_id))];
      const { data: sellers } = await admin
        .from("profiles")
        .select("id, full_name, store_slug")
        .in("id", sellerIds);

      // Fetch this buyer's own active (pending) checkout reservations so the
      // UI can distinguish "actually sold out" from "you have a checkout in
      // progress". reserved_quantity on products already includes these.
      const { data: ownSessions } = await admin
        .from("checkout_sessions")
        .select("id, status, created_at")
        .eq("buyer_id", buyerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      const activeSessionIds = (ownSessions || []).map((s: any) => s.id);
      const newestSessionId = activeSessionIds[0] || null;

      let ownReservedMap = new Map<string, number>();
      const productSessionMap = new Map<string, string>();
      if (activeSessionIds.length > 0) {
        const { data: ownItems } = await admin
          .from("checkout_session_items")
          .select("product_id, quantity, checkout_session_id")
          .in("checkout_session_id", activeSessionIds);
        for (const it of ownItems || []) {
          const pid = (it as any).product_id as string;
          const qty = Number((it as any).quantity || 0);
          ownReservedMap.set(pid, (ownReservedMap.get(pid) || 0) + qty);
          // Prefer newest session (first in ordered list) for resume link
          if (!productSessionMap.has(pid)) {
            productSessionMap.set(pid, (it as any).checkout_session_id);
          }
        }
      }

      const productMap = new Map((products || []).map((p: any) => [p.id, p]));
      const mediaMap = new Map((mediaRows || []).map((m: any) => [m.product_id, m.files?.file_url]));
      const sellerMap = new Map((sellers || []).map((s: any) => [s.id, s]));

      const enriched = cartItems.map((ci: any) => {
        const product = productMap.get(ci.product_id);
        if (!product) return { ...ci, product: null };
        const availableQuantity = Math.max(0, product.stock_quantity - product.reserved_quantity);
        const ownReserved = ownReservedMap.get(product.id) || 0;
        const seller = sellerMap.get(product.seller_id);
        return {
          ...ci,
          product: {
            id: product.id,
            title: product.title,
            slug: product.slug,
            unit_price: product.unit_price,
            currency_code: product.currency_code,
            stock_quantity: product.stock_quantity,
            reserved_quantity: product.reserved_quantity,
            available_quantity: availableQuantity,
            own_reserved_quantity: ownReserved,
            active_checkout_session_id: productSessionMap.get(product.id) || null,
            status: product.status,
            is_active: product.is_active,
            visibility_type: product.visibility_type,
            short_description: product.short_description,
            primary_image: mediaMap.get(product.id) || null,
            seller_id: product.seller_id,
            seller_name: seller?.full_name || "Seller",
            seller_slug: seller?.store_slug || null,
            delivery_method: product.delivery_method ?? null,
          },
        };
      });

      return json({
        items: enriched,
        count: enriched.length,
        active_checkout_session_id: newestSessionId,
      });
    }

    // ── POST: add / remove / update_quantity ──
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "add") {
      const productId = body.product_id as string;
      const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
      if (!productId) return json({ error: "product_id required" }, 400);

      // Validate product
      const { data: product, error: pErr } = await admin
        .from("products")
        .select("id, status, is_active, visibility_type, stock_quantity, reserved_quantity, seller_id")
        .eq("id", productId)
        .single();

      if (pErr || !product) return json({ error: "Product not found" }, 404);
      if (product.status !== "published" || !product.is_active || product.visibility_type !== "public") {
        return json({ error: "Product is not available for purchase" }, 400);
      }
      if (product.seller_id === buyerId) {
        return json({ error: "Cannot add your own product to cart" }, 400);
      }

      // Commerce gate: platform + vendor add-to-cart kill switch,
      // and disabled/suspended vendors are blocked.
      const { checkAddToCartAllowed } = await import("../_shared/commerce-gate.ts");
      const gate = await checkAddToCartAllowed(product.seller_id);
      if (gate) return json(gate.body, gate.status);

      const available = product.stock_quantity - product.reserved_quantity;
      if (quantity > available) {
        return json({ error: `Only ${available} units available` }, 400);
      }

      // Upsert cart item
      const { data: cartItem, error: insertErr } = await admin
        .from("cart_items")
        .upsert(
          { buyer_id: buyerId, product_id: productId, quantity },
          { onConflict: "buyer_id,product_id" }
        )
        .select("id")
        .single();

      if (insertErr) throw insertErr;
      return json({ success: true, cart_item_id: cartItem.id });
    }

    if (action === "remove") {
      const productId = body.product_id as string;
      if (!productId) return json({ error: "product_id required" }, 400);

      // Check for linked awaiting_payment transaction to cancel
      const { data: linkedTx } = await admin
        .from("transactions")
        .select("id, status, money_status, source_product_id, buyer_id")
        .eq("buyer_id", buyerId)
        .eq("source_product_id", productId)
        .eq("status", "awaiting_payment")
        .maybeSingle();

      if (linkedTx) {
        // Get transaction items to know how much stock to release
        const { data: txItems } = await admin
          .from("transaction_items")
          .select("quantity")
          .eq("transaction_id", linkedTx.id);

        const reservedQty = txItems?.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0) || 0;

        // Cancel the transaction with full audit trail.
        const nowIso = new Date().toISOString();
        const moneyShouldCancel =
          linkedTx.money_status === "not_secured" ||
          linkedTx.money_status === "payment_pending";
        await admin
          .from("transactions")
          .update({
            status: "cancelled",
            cancelled_at: nowIso,
            ...(moneyShouldCancel ? { money_status: "cancelled" } : {}),
            updated_at: nowIso,
          })
          .eq("id", linkedTx.id);

        await admin.from("transaction_status_history").insert({
          transaction_id: linkedTx.id,
          old_status: linkedTx.status,
          new_status: "cancelled",
          reason: "Cart item removed during pending checkout",
          changed_by_user_id: buyerId,
          changed_at: nowIso,
        });
        if (moneyShouldCancel) {
          await admin.from("money_status_history").insert({
            transaction_id: linkedTx.id,
            old_status: linkedTx.money_status,
            new_status: "cancelled",
            reason: "Cart item removed during pending checkout",
            changed_by_user_id: buyerId,
          });
        }

        // Release reserved stock
        if (reservedQty > 0) {
          const { data: product } = await admin
            .from("products")
            .select("reserved_quantity, stock_quantity")
            .eq("id", productId)
            .single();

          if (product) {
            const newReserved = Math.max(0, product.reserved_quantity - reservedQty);
            await admin
              .from("products")
              .update({ reserved_quantity: newReserved })
              .eq("id", productId);

            // Log release (idempotent per cancelled transaction)
            const { data: existingLog } = await admin
              .from("product_inventory_logs")
              .select("id")
              .eq("product_id", productId)
              .eq("change_type", "release")
              .eq("reference_type", "transaction_cancelled")
              .eq("reference_id", linkedTx.id)
              .maybeSingle();

            if (!existingLog) {
              await admin.from("product_inventory_logs").insert({
                product_id: productId,
                change_type: "release",
                quantity_delta: -reservedQty,
                balance_after: product.stock_quantity - newReserved,
                reference_type: "transaction_cancelled",
                reference_id: linkedTx.id,
                notes: "Stock released after cart-item removal cancelled the transaction",
                changed_by_user_id: buyerId,
              });
            }
          }
        }
      }

      // Clean up any pending checkout_session_items for this buyer + product
      // so the cart UI no longer shows the row as "Checkout in progress".
      // (Inventory + transaction cancel were already handled above when a
      // linked awaiting_payment transaction existed.)
      const { data: pendingSessions } = await admin
        .from("checkout_sessions")
        .select("id")
        .eq("buyer_id", buyerId)
        .eq("status", "pending");

      const pendingSessionIds = (pendingSessions || []).map((s: any) => s.id);
      if (pendingSessionIds.length > 0) {
        // Delete this product's items from those sessions
        await admin
          .from("checkout_session_items")
          .delete()
          .in("checkout_session_id", pendingSessionIds)
          .eq("product_id", productId);

        // Cancel any session that is now empty
        for (const sid of pendingSessionIds) {
          const { count } = await admin
            .from("checkout_session_items")
            .select("id", { count: "exact", head: true })
            .eq("checkout_session_id", sid);
          if ((count || 0) === 0) {
            await admin
              .from("checkout_sessions")
              .update({ status: "cancelled" })
              .eq("id", sid);
          }
        }
      }

      // Delete cart item
      await admin
        .from("cart_items")
        .delete()
        .eq("buyer_id", buyerId)
        .eq("product_id", productId);

      return json({ success: true });
    }

    if (action === "update_quantity") {
      const productId = body.product_id as string;
      const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
      if (!productId) return json({ error: "product_id required" }, 400);

      // Validate stock
      const { data: product } = await admin
        .from("products")
        .select("stock_quantity, reserved_quantity, seller_id")
        .eq("id", productId)
        .single();

      if (!product) return json({ error: "Product not found" }, 404);

      // Commerce gate: changing cart quantity is a cart mutation, so it is
      // gated by the same add-to-cart kill switch as `add`. Removal stays
      // allowed when the switch is off so buyers are never trapped.
      const { checkAddToCartAllowed } = await import("../_shared/commerce-gate.ts");
      const qtyGate = await checkAddToCartAllowed(product.seller_id);
      if (qtyGate) return json(qtyGate.body, qtyGate.status);

      const available = product.stock_quantity - product.reserved_quantity;
      if (quantity > available) {
        return json({ error: `Only ${available} units available` }, 400);
      }

      await admin
        .from("cart_items")
        .update({ quantity })
        .eq("buyer_id", buyerId)
        .eq("product_id", productId);

      return json({ success: true });
    }

    if (action === "check") {
      // Quick check if a product is in cart
      const productId = body.product_id as string;
      if (!productId) return json({ error: "product_id required" }, 400);

      const { data: item } = await admin
        .from("cart_items")
        .select("id, quantity")
        .eq("buyer_id", buyerId)
        .eq("product_id", productId)
        .maybeSingle();

      return json({ in_cart: !!item, quantity: item?.quantity || 0 });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("buyer-cart error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
