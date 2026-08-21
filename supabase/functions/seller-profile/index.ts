import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

// ── Seller tiered limits (mirrors buyer) ──
const LIMIT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 50_000,
  trusted_buyer: 200_000,
  high_trust_buyer: 500_000,
};

const CONCURRENT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 1,
  trusted_buyer: 3,
  high_trust_buyer: 5,
};

const VERIFICATION_LABEL_MAP: Record<string, string> = {
  // Account-tier names only. These describe the seller's own stored tier and are
  // NOT verification badges: the identity-verified badge requires identity_verified and
  // lives in src/lib/trust/trust-claims.ts.
  unverified: "Unverified account",
  basic_verified: "Contact details confirmed",
  trusted_buyer: "Trusted tier",
  high_trust_buyer: "Premium tier",
};

const ACTIVE_TX_STATUSES = [
  "awaiting_buyer",
  "awaiting_payment",
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
  "disputed",
];

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

    // Check seller role
    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // ── GET: Fetch all profile data ──
    if (req.method === "GET") {
      const [profileResult, prefsResult, verificationResult, payoutAccountResult] =
        await Promise.allSettled([
          adminClient
            .from("profiles")
            .select("id, full_name, email, phone, avatar_url, country_code, state_name, city_name, is_region_eligible, status, created_at")
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
          adminClient
            .from("payout_accounts")
            .select("bank_name, account_name, masked_account_number, verification_status, last_verified_at, updated_at, provider_recipient_code")
            .eq("user_id", userId)
            .single(),
        ]);

      const profileData =
        profileResult.status === "fulfilled" && profileResult.value.data
          ? profileResult.value.data
          : {
              id: userId, full_name: "", email: "", phone: null, avatar_url: null,
              country_code: "NG", state_name: null, city_name: null,
              is_region_eligible: false, status: "active", created_at: "",
            };

      const preferences =
        prefsResult.status === "fulfilled" && prefsResult.value.data
          ? prefsResult.value.data
          : {
              payment_updates: true, delivery_updates: true, dispute_updates: true,
              verification_reminders: true, system_alerts: true, marketing_messages: false,
            };

      const emailVerified = !!userData.user.email_confirmed_at;
      const verificationData =
        verificationResult.status === "fulfilled" && verificationResult.value.data
          ? { ...verificationResult.value.data, email_verified: emailVerified }
          : { email_verified: emailVerified, phone_verified: false, identity_verified: false, payout_verified: false };

      const payoutAccount =
        payoutAccountResult.status === "fulfilled" && payoutAccountResult.value.data
          ? payoutAccountResult.value.data
          : null;

      // Build response
      const profile = {
        id: profileData.id,
        full_name: profileData.full_name,
        email: profileData.email,
        phone: profileData.phone,
        avatar_url: profileData.avatar_url,
        country_code: profileData.country_code,
        state_name: profileData.state_name,
        city_name: profileData.city_name,
        created_at: profileData.created_at,
      };

      // ── Compute payout readiness from strict definition ──
      // payout_ready = account exists AND verification_status='verified' AND provider_recipient_code present
      const recipientCode =
        payoutAccount && typeof (payoutAccount as { provider_recipient_code?: string | null }).provider_recipient_code === "string"
          ? ((payoutAccount as { provider_recipient_code?: string | null }).provider_recipient_code ?? "").trim()
          : "";
      const accountVerified = !!payoutAccount && (payoutAccount as { verification_status?: string }).verification_status === "verified";
      const payoutReady = !!payoutAccount && accountVerified && recipientCode.length > 0;
      let payoutBlockerReason: "missing" | "unverified" | "no_recipient_code" | null = null;
      if (!payoutAccount) payoutBlockerReason = "missing";
      else if (!accountVerified) payoutBlockerReason = "unverified";
      else if (recipientCode.length === 0) payoutBlockerReason = "no_recipient_code";

      // Strip recipient code from outbound payload (internal field)
      const payoutAccountSafe = payoutAccount
        ? (() => {
            const { provider_recipient_code: _omit, ...rest } = payoutAccount as Record<string, unknown> & {
              provider_recipient_code?: string | null;
            };
            return { ...rest, payout_ready: payoutReady, payout_blocker_reason: payoutBlockerReason };
          })()
        : null;

      const verification = {
        ...verificationData,
        // Override cached flag with the strict, derived value. Single source of truth
        payout_verified: payoutReady,
        payout_ready: payoutReady,
        payout_blocker_reason: payoutBlockerReason,
        is_region_eligible: profileData.is_region_eligible,
      };

      const account_meta = {
        member_since: profileData.created_at,
        account_status: profileData.status,
        role: "seller",
      };

      // ── Compute seller permissions ──
      const level =
        ((verificationData as Record<string, unknown>).verification_level as string | undefined) || "unverified";
      let activeTransactionCount = 0;
      try {
        const { count } = await adminClient
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", userId)
          .in("status", ACTIVE_TX_STATUSES);
        activeTransactionCount = count ?? 0;
      } catch {
        // default 0
      }

      // An unrecognised verification level is a data fault, not a zero
      // allowance. Report it as null rather than showing a ₦0 limit.
      const knownLevel =
        Object.prototype.hasOwnProperty.call(LIMIT_BY_LEVEL, level) &&
        Object.prototype.hasOwnProperty.call(CONCURRENT_BY_LEVEL, level);
      const permissions = {
        verificationLevel: level,
        verificationLabel: VERIFICATION_LABEL_MAP[level] ?? VERIFICATION_LABEL_MAP.unverified,
        transactionLimitNaira: knownLevel ? LIMIT_BY_LEVEL[level] : null,
        maxConcurrentActiveTransactions: knownLevel ? CONCURRENT_BY_LEVEL[level] : null,
        activeTransactionCount,
        canPublishTransaction: level !== "unverified",
        canCreateAnotherActiveTransaction:
          level !== "unverified" && knownLevel && activeTransactionCount < CONCURRENT_BY_LEVEL[level],
        requiresIdentityVerification: level !== "trusted_buyer" && level !== "high_trust_buyer",
      };

      return jsonResponse({ profile, verification, preferences, payout_account: payoutAccountSafe, account_meta, permissions });
    }

    // ── PATCH: Update profile data ──
    if (req.method === "PATCH") {
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

        if (body.state_name !== undefined) {
          if (body.state_name !== null && typeof body.state_name !== "string") {
            return jsonResponse({ error: "state_name must be a string or null" }, 400);
          }
          updates.state_name = body.state_name;
        }

        if (body.city_name !== undefined) {
          if (body.city_name !== null && typeof body.city_name !== "string") {
            return jsonResponse({ error: "city_name must be a string or null" }, 400);
          }
          updates.city_name = body.city_name;
        }

        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "No valid profile fields provided" }, 400);
        }

        const { data: updatedProfile, error } = await adminClient
          .from("profiles")
          .update(updates)
          .eq("id", userId)
          .select("id, full_name, email, phone, avatar_url, country_code, state_name, city_name, created_at")
          .single();

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true, profile: updatedProfile });
      }

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

        const { data: savedPrefs, error } = await adminClient
          .from("notification_preferences")
          .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" })
          .select("payment_updates, delivery_updates, dispute_updates, verification_reminders, system_alerts, marketing_messages")
          .single();

        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ success: true, preferences: savedPrefs });
      }

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
    console.error("seller-profile error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
