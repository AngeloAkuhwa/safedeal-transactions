// Rotate the active rider delivery confirmation token.
// Marks the current 'active' token 'revoked' and issues a fresh one.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEdgeError } from "../_shared/log-error.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateRiderToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  for (const b of bytes) result += chars[b % chars.length];
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Not authenticated" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const transactionId = body.transaction_id as string;
    const appOrigin = (body.app_origin as string | undefined)?.replace(/\/$/, "");
    if (!transactionId) {
      return jsonResponse({ ok: false, error: "transaction_id required" }, 400);
    }

    // Verify caller is the seller
    const { data: tx } = await admin
      .from("transactions")
      .select("id, seller_id, buyer_id, status")
      .eq("id", transactionId)
      .single();

    if (!tx) {
      return jsonResponse({ ok: false, error: "Transaction not found" }, 404);
    }
    if (tx.seller_id !== userId) {
      return jsonResponse({ ok: false, error: "Only the seller can regenerate the link" }, 403);
    }
    if (!tx.buyer_id) {
      return jsonResponse({ ok: false, error: "Buyer not yet linked to transaction" }, 400);
    }
    if (!["seller_preparing_delivery", "seller_dispatched"].includes(tx.status)) {
      await logEdgeError(admin, {
        req,
        function_name: "rotate-delivery-token",
        user_id: userId,
        error_code: "invalid_status",
        message: `Cannot rotate token in status=${tx.status}`,
        http_status: 409,
        request_context: { transaction_id: transactionId, status: tx.status },
      });
      return jsonResponse({
        ok: false,
        error: "Rider link can only be regenerated while preparing or dispatched.",
      }, 200);
    }

    // Revoke existing active token(s)
    await admin
      .from("delivery_confirmation_tokens")
      .update({ status: "revoked" })
      .eq("transaction_id", transactionId)
      .eq("status", "active");

    // Issue fresh token
    const newToken = generateRiderToken();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const publicBase = Deno.env.get("PUBLIC_APP_URL");
    const headerOrigin = req.headers.get("origin") ?? "";
    const appBase = publicBase || appOrigin || headerOrigin;
    const persistedUrl = appBase ? `${appBase}/delivery/confirm/${newToken}` : null;

    const { error: insertErr } = await admin
      .from("delivery_confirmation_tokens")
      .insert({
        transaction_id: transactionId,
        seller_id: userId,
        buyer_id: tx.buyer_id,
        token: newToken,
        expires_at: expiresAt,
        status: "active",
        confirmation_url: persistedUrl,
      });

    if (insertErr) {
      await logEdgeError(admin, {
        req,
        function_name: "rotate-delivery-token",
        user_id: userId,
        error_code: "insert_failed",
        message: insertErr.message,
        http_status: 500,
        request_context: { transaction_id: transactionId },
      });
      return jsonResponse({ ok: false, error: "Failed to issue new token" }, 500);
    }

    return jsonResponse({
      ok: true,
      token: newToken,
      url: persistedUrl ?? `/delivery/confirm/${newToken}`,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error("rotate-delivery-token error:", err);
    await logEdgeError(admin, {
        req,
      function_name: "rotate-delivery-token",
      error_code: "exception",
      message: (err as Error)?.message || String(err),
      http_status: 500,
    });
    return jsonResponse({ ok: false, error: "Internal server error" }, 500);
  }
});
