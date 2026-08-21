import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Releases reservations held by stale `awaiting_payment` transactions.
 * Default cutoff is 24 hours, overridable via { hours: number } body or ?hours= query.
 * Idempotent: each pass marks the tx 'expired' so it won't be processed twice.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let hours = 24;
    const url = new URL(req.url);
    const qh = url.searchParams.get("hours");
    if (qh) hours = Math.max(1, parseInt(qh, 10) || 24);
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.hours === "number") hours = Math.max(1, body.hours);
      } catch (_) { /* no body: fine */ }
    }

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin.rpc("release_expired_awaiting_payment", {
      _cutoff: cutoff,
    });

    if (error) {
      console.error("[cart-expiry-cleanup] rpc error", error);
      return json({ error: error.message }, 500);
    }

    // Also delete cart_items abandoned for 7+ days (hygiene only. They don't reserve stock)
    const sevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: cartErr, count: cartDeleted } = await admin
      .from("cart_items")
      .delete({ count: "exact" })
      .lt("updated_at", sevenDays);
    if (cartErr) console.error("[cart-expiry-cleanup] cart delete error", cartErr);

    return json({
      ok: true,
      cutoff,
      hours,
      released: data ?? [],
      stale_cart_items_deleted: cartDeleted ?? 0,
    });
  } catch (e) {
    console.error("[cart-expiry-cleanup] fatal", e);
    return json({ error: String(e) }, 500);
  }
});