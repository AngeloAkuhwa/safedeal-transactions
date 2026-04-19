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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { transaction_id, message } = body;

    if (!transaction_id || typeof transaction_id !== "string") {
      return new Response(JSON.stringify({ error: "transaction_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!message || typeof message !== "string" || message.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Message must be at least 10 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for admin operations (inserting notifications)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch transaction to verify user is buyer and get seller_id
    const { data: txData, error: txError } = await serviceClient
      .from("transactions")
      .select("id, buyer_id, seller_id, transaction_code")
      .eq("id", transaction_id)
      .single();

    if (txError || !txData) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the sender is the buyer (or seller for reverse messaging in future)
    if (txData.buyer_id !== userId && txData.seller_id !== userId) {
      return new Response(JSON.stringify({ error: "You are not a party to this transaction" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine recipient
    const recipientId = txData.buyer_id === userId ? txData.seller_id : txData.buyer_id;

    // Insert the message
    const { error: msgError } = await serviceClient.from("transaction_messages").insert({
      transaction_id,
      sender_user_id: userId,
      recipient_user_id: recipientId,
      message_text: message.trim(),
    });

    if (msgError) {
      console.error("Failed to insert message:", msgError);
      return new Response(JSON.stringify({ error: "Failed to send message" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender name for notification
    const { data: senderProfile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const senderName = senderProfile?.full_name || "A user";

    // Create notification for recipient as a "direct_message" so it shows
    // in the Messages bucket on both buyer and seller notification screens.
    const recipientIsSeller = recipientId === txData.seller_id;
    const deeplinkRoute = recipientIsSeller
      ? `/seller/transactions/${transaction_id}#messages`
      : `/dashboard/transactions/${transaction_id}#messages`;

    const { error: notifError } = await serviceClient.from("notifications").insert({
      user_id: recipientId,
      type: "direct_message",
      channel: "in_app",
      title: `New message from ${senderName}`,
      message: message.trim().length > 100 ? message.trim().slice(0, 100) + "…" : message.trim(),
      related_transaction_id: transaction_id,
      status: "pending",
      is_read: false,
      metadata: { event_type: "direct_message", route: deeplinkRoute },
    });

    if (notifError) {
      console.error("Failed to create notification (non-fatal):", notifError);
      // Don't fail the request - message was sent successfully
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-seller-message error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
