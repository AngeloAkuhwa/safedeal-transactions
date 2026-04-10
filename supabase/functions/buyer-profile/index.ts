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

const PREF_KEYS = [
  "payment_updates",
  "delivery_updates",
  "dispute_updates",
  "verification_reminders",
  "system_alerts",
  "marketing_messages",
] as const;

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

      const emailVerified = !!userData.user.email_confirmed_at;
      const verification =
        verificationResult.status === "fulfilled" && verificationResult.value.data
          ? { ...verificationResult.value.data, email_verified: emailVerified }
          : { email_verified: emailVerified, phone_verified: false, identity_verified: false, payout_verified: false };

      return jsonResponse({ profile, preferences, verification });
    }

    // ── PATCH: Update profile data ──
    if (req.method === "PATCH") {
      // Parse body safely
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const action = body?.action;
      if (typeof action !== "string" || !action) {
        return jsonResponse({ error: "Missing or invalid 'action' field" }, 400);
      }

      // ── update_profile ──
      if (action === "update_profile") {
        const updates: Record<string, unknown> = {};

        if (body.full_name !== undefined) {
          if (typeof body.full_name !== "string" || body.full_name.trim().length === 0) {
            return jsonResponse({ error: "full_name must be a non-empty string" }, 400);
          }
          if (body.full_name.length > 100) {
            return jsonResponse({ error: "full_name must be 100 characters or less" }, 400);
          }
          updates.full_name = body.full_name.trim();
        }

        if (body.phone !== undefined) {
          if (body.phone !== null && (typeof body.phone !== "string" || body.phone.length > 20)) {
            return jsonResponse({ error: "phone must be a string of 20 characters or less" }, 400);
          }
          updates.phone = body.phone;
        }

        if (body.country_code !== undefined) {
          if (typeof body.country_code !== "string" || body.country_code.length !== 2) {
            return jsonResponse({ error: "country_code must be a 2-character string" }, 400);
          }
          updates.country_code = body.country_code.toUpperCase();
        }

        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "No valid profile fields provided" }, 400);
        }

        const { data: updatedProfile, error } = await adminClient
          .from("profiles")
          .update(updates)
          .eq("id", userId)
          .select("id, full_name, email, phone, avatar_url, country_code, created_at")
          .single();

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true, profile: updatedProfile });
      }

      // ── update_preferences ──
      if (action === "update_preferences") {
        const updates: Record<string, boolean> = {};
        for (const key of PREF_KEYS) {
          if (body[key] !== undefined) {
            if (typeof body[key] !== "boolean") {
              return jsonResponse({ error: `${key} must be a boolean` }, 400);
            }
            updates[key] = body[key] as boolean;
          }
        }

        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "No valid preference fields provided" }, 400);
        }

        // Upsert: works whether or not a row exists
        const { data: savedPrefs, error } = await adminClient
          .from("notification_preferences")
          .upsert(
            { user_id: userId, ...updates },
            { onConflict: "user_id" }
          )
          .select("payment_updates, delivery_updates, dispute_updates, verification_reminders, system_alerts, marketing_messages")
          .single();

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true, preferences: savedPrefs });
      }

      // ── update_avatar ──
      if (action === "update_avatar") {
        if (body.avatar_url !== undefined && body.avatar_url !== null && typeof body.avatar_url !== "string") {
          return jsonResponse({ error: "avatar_url must be a string or null" }, 400);
        }

        const { error } = await adminClient
          .from("profiles")
          .update({ avatar_url: body.avatar_url ?? null })
          .eq("id", userId);

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true });
      }

      return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("buyer-profile error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
