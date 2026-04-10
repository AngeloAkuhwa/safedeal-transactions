import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const disputeId = String(body.dispute_id || "").trim();
    const responseText = String(body.response_text || "").trim();

    if (!disputeId) {
      return jsonResponse({ error: "dispute_id is required" }, 400);
    }
    if (!responseText || responseText.length < 10) {
      return jsonResponse({ error: "response_text must be at least 10 characters" }, 400);
    }
    if (responseText.length > 5000) {
      return jsonResponse({ error: "response_text must not exceed 5000 characters" }, 400);
    }

    // Fetch dispute and verify seller ownership
    const { data: dispute, error: disputeError } = await adminClient
      .from("disputes")
      .select("id, transaction_id, status")
      .eq("id", disputeId)
      .single();

    if (disputeError || !dispute) {
      return jsonResponse({ error: "Dispute not found" }, 404);
    }

    const { data: transaction, error: txError } = await adminClient
      .from("transactions")
      .select("id, seller_id")
      .eq("id", dispute.transaction_id)
      .single();

    if (txError || !transaction || transaction.seller_id !== userId) {
      return jsonResponse({ error: "Access denied" }, 403);
    }

    // Check if response already exists
    const { data: existingResponse } = await adminClient
      .from("dispute_responses")
      .select("id")
      .eq("dispute_id", disputeId)
      .single();

    if (existingResponse) {
      return jsonResponse({ error: "A response has already been submitted for this dispute" }, 409);
    }

    // Insert response
    const { error: insertError } = await adminClient
      .from("dispute_responses")
      .insert({
        dispute_id: disputeId,
        responded_by_user_id: userId,
        response_text: responseText,
      });

    if (insertError) {
      console.error("Insert dispute response error:", insertError);
      return jsonResponse({ error: "Failed to submit response" }, 500);
    }

    // Update dispute status to under_review if it was pending seller response
    if (dispute.status === "seller_response_pending" || dispute.status === "open") {
      await adminClient
        .from("disputes")
        .update({ status: "under_review" })
        .eq("id", disputeId);

      // Record status change
      await adminClient.from("dispute_status_history").insert({
        dispute_id: disputeId,
        old_status: dispute.status,
        new_status: "under_review",
        changed_by_user_id: userId,
        reason: "Seller submitted response",
      });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("submit-seller-response error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
