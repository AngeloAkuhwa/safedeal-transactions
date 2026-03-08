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
    // 1. Authenticate
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

    // 2. Check buyer role
    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "buyer",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Buyer role required" }, 403);
    }

    // ── GET: Fetch profile data ──
    if (req.method === "GET") {
      const [profileResult, prefsResult, verificationResult] = await Promise.allSettled([
        adminClient
          .from("profiles")
          .select("id, full_name, email, phone, avatar_url, country_code, created_at")
          .eq("id", userId)
          .single(),
        adminClient
          .from("notification_preferences")
          .select("payment_updates, delivery_updates, dispute_updates, verification_reminders, system_alerts, marketing_messages")
          .eq("user_id", userId)
          .single(),
        adminClient
          .from("account_verifications")
          .select("email_verified, phone_verified, identity_verified, payout_verified")
          .eq("user_id", userId)
          .single(),
      ]);

      const profile =
        profileResult.status === "fulfilled" && profileResult.value.data
          ? profileResult.value.data
          : { id: userId, full_name: "", email: "", phone: null, avatar_url: null, country_code: "NG", created_at: "" };

      const preferences =
        prefsResult.status === "fulfilled" && prefsResult.value.data
          ? prefsResult.value.data
          : { payment_updates: true, delivery_updates: true, dispute_updates: true, verification_reminders: true, system_alerts: true, marketing_messages: false };

      const verification =
        verificationResult.status === "fulfilled" && verificationResult.value.data
          ? verificationResult.value.data
          : { email_verified: false, phone_verified: false, identity_verified: false, payout_verified: false };

      return jsonResponse({ profile, preferences, verification });
    }

    // ── PATCH: Update profile data ──
    if (req.method === "PATCH") {
      const body = await req.json();
      const { action } = body;

      if (action === "update_profile") {
        const updates: Record<string, unknown> = {};
        if (body.full_name !== undefined) updates.full_name = body.full_name;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.country_code !== undefined) updates.country_code = body.country_code;

        const { error } = await adminClient
          .from("profiles")
          .update(updates)
          .eq("id", userId);

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true });
      }

      if (action === "update_preferences") {
        const allowed = ["payment_updates", "delivery_updates", "dispute_updates", "verification_reminders", "system_alerts", "marketing_messages"];
        const updates: Record<string, boolean> = {};
        for (const key of allowed) {
          if (body[key] !== undefined) updates[key] = Boolean(body[key]);
        }

        const { error } = await adminClient
          .from("notification_preferences")
          .update(updates)
          .eq("user_id", userId);

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true });
      }

      if (action === "update_avatar") {
        const { error } = await adminClient
          .from("profiles")
          .update({ avatar_url: body.avatar_url ?? null })
          .eq("id", userId);

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true });
      }

      return jsonResponse({ error: "Unknown action" }, 400);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("buyer-profile error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
