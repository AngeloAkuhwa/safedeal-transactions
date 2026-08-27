import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { LAUNCH_REGION_COUNTRY_CODE } from "../_shared/launch-region.ts";
import {
  BUYER_AMOUNT_LIMIT_BY_LEVEL,
  BUYER_CONCURRENT_SHOWN_IN_PROFILE,
} from "../_shared/verification-limits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

// ── Tiered permission engine ──
// Only `unverified` and `basic_verified` are reachable in Batch 2.
// `trusted_buyer` and `high_trust_buyer` are scaffolded for future identity-based upgrades.


const ACTIVE_TX_STATUSES = [
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
  "disputed",
];

async function computePermissions(
  verification: Record<string, unknown>,
  profile: Record<string, unknown>,
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const level = (verification.verification_level as string) || "unverified";
  const phoneVerified = !!verification.phone_verified;
  const hasLocation = !!(profile.state_name && profile.city_name);
  // Derived, not read. `profiles.is_region_eligible` is a display cache that
  // this function itself writes on profile update; reading it here gave the
  // UI's pay-button gate a different source of truth from the database's
  // `is_user_region_allowed`, so the two could disagree: and the UI would be
  // the one telling the buyer they may pay.
  const { data: regionAllowed } = await adminClient.rpc("is_user_region_allowed", { _user_id: userId });
  const isRegionEligible = !!regionAllowed;

  // Count active transactions
  let activeTransactionCount = 0;
  try {
    const { count } = await adminClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .in("status", ACTIVE_TX_STATUSES);
    activeTransactionCount = count ?? 0;
  } catch {
    // default 0
  }

  // An unrecognised verification level is a data fault, not a zero allowance.
  // We surface it as `null` so the UI shows "unavailable" rather than telling
  // the buyer their limit is ₦0: the enforcement path (initiate-paystack-
  // payment) refuses the payment outright for the same reason.
  const knownLevel =
    Object.prototype.hasOwnProperty.call(BUYER_CONCURRENT_SHOWN_IN_PROFILE, level) &&
    Object.prototype.hasOwnProperty.call(BUYER_AMOUNT_LIMIT_BY_LEVEL, level);
  const maxConcurrent = knownLevel ? BUYER_CONCURRENT_SHOWN_IN_PROFILE[level] : null;
  const transactionLimit = knownLevel ? BUYER_AMOUNT_LIMIT_BY_LEVEL[level] : null;

  // Explicit triple-check: phone + location + level must all pass
  const canAct = phoneVerified && hasLocation && level !== "unverified";

  return {
    canStartProtectedPayment: canAct && isRegionEligible,
    canOpenDispute: canAct,
    canHoldActiveTransaction: canAct,
    requiresPhoneVerification: !phoneVerified,
    requiresLocation: !hasLocation,
    transactionLimitNaira: transactionLimit,
    maxConcurrentActiveTransactions: maxConcurrent,
    verificationLevel: level,
    // New Batch 2 flags
    canCreateAnotherActiveTransaction: canAct && activeTransactionCount < maxConcurrent,
    canAccessHighValueTransaction: level === "trusted_buyer" || level === "high_trust_buyer",
    canReceiveHighTierRefund: level === "high_trust_buyer",
    requiresIdentityVerification: level !== "trusted_buyer" && level !== "high_trust_buyer",
    activeTransactionCount,
    isRegionEligible,
  };
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
          .select("id, full_name, email, phone, avatar_url, country_code, state_name, city_name, is_region_eligible, created_at")
          .eq("id", userId)
          .single(),
        adminClient
          .from("notification_preferences")
          .select("payment_updates, delivery_updates, dispute_updates, verification_reminders, system_alerts, marketing_messages")
          .eq("user_id", userId)
          .single(),
        adminClient
          .from("account_verifications")
          .select("email_verified, phone_verified, identity_verified, payout_verified, verification_level")
          .eq("user_id", userId)
          .single(),
      ]);

      const profile =
        profileResult.status === "fulfilled" && profileResult.value.data
          ? profileResult.value.data
          // A missing profile row has NO recorded country. Filling in "NG"
          // invents a fact about the user; carry null and let the UI ask.
          : { id: userId, full_name: "", email: "", phone: null, avatar_url: null, country_code: null, state_name: null, city_name: null, is_region_eligible: false, created_at: "" };

      const preferences =
        prefsResult.status === "fulfilled" && prefsResult.value.data
          ? prefsResult.value.data
          : { payment_updates: true, delivery_updates: true, dispute_updates: true, verification_reminders: true, system_alerts: true, marketing_messages: false };

      const emailVerified = !!userData.user.email_confirmed_at;
      const verification =
        verificationResult.status === "fulfilled" && verificationResult.value.data
          ? { ...verificationResult.value.data, email_verified: emailVerified }
          : { email_verified: emailVerified, phone_verified: false, identity_verified: false, payout_verified: false, verification_level: "unverified" };

      const permissions = await computePermissions(verification, profile, adminClient, userId);

      // Fetch latest identity submission (never expose review_notes)
      let identitySubmission = null;
      try {
        const { data: idSub } = await adminClient
          .from("identity_submissions")
          .select("id, status, verification_method, legal_name, date_of_birth, masked_identifier, consent_accepted_at, submitted_at, reviewed_at, rejected_at, rejection_reason, provider_reference, created_at, updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        identitySubmission = idSub;
      } catch {
        // non-critical
      }

      return jsonResponse({ profile, preferences, verification, permissions, identity_submission: identitySubmission });
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

        // ── Location validation against serviceable_regions ──
        const hasLocationUpdate = body.state_name !== undefined || body.city_name !== undefined;
        if (hasLocationUpdate) {
          const stateName = body.state_name !== undefined
            ? (body.state_name ? String(body.state_name).trim() : null)
            : undefined;
          const cityName = body.city_name !== undefined
            ? (body.city_name ? String(body.city_name).trim() : null)
            : undefined;

          // Validate lengths
          if (stateName !== undefined && stateName !== null && stateName.length > 100) {
            return jsonResponse({ error: "state_name must be 100 characters or less" }, 400);
          }
          if (cityName !== undefined && cityName !== null && cityName.length > 100) {
            return jsonResponse({ error: "city_name must be 100 characters or less" }, 400);
          }

          // Determine effective state/city for validation
          let effectiveState = stateName;
          let effectiveCity = cityName;

          // If only one is provided, fetch the other from current profile
          if (effectiveState === undefined || effectiveCity === undefined) {
            const { data: currentProfile } = await adminClient
              .from("profiles")
              .select("state_name, city_name")
              .eq("id", userId)
              .single();
            if (effectiveState === undefined) effectiveState = currentProfile?.state_name ?? null;
            if (effectiveCity === undefined) effectiveCity = currentProfile?.city_name ?? null;
          }

          let isRegionEligible = false;

          if (effectiveState) {
            // Validate state exists in serviceable_regions
            const { data: stateRows } = await adminClient
              .from("serviceable_regions")
              .select("id, city_name, is_active")
              .eq("country_code", LAUNCH_REGION_COUNTRY_CODE)
              .eq("state_name", effectiveState);

            if (!stateRows || stateRows.length === 0) {
              return jsonResponse({ error: `Invalid state: "${effectiveState}" is not a recognized Nigerian state` }, 400);
            }

            // Check if state has LGA rows (like Lagos)
            const lgaRows = stateRows.filter((r: Record<string, unknown>) => r.city_name !== null);

            if (lgaRows.length > 0 && effectiveCity) {
              // State has LGAs: validate the city/LGA exists
              const matchedLga = lgaRows.find(
                (r: Record<string, unknown>) =>
                  (r.city_name as string).toLowerCase() === effectiveCity!.toLowerCase()
              );
              if (!matchedLga) {
                return jsonResponse({
                  error: `Invalid LGA: "${effectiveCity}" is not a valid Local Government Area in ${effectiveState}`,
                }, 400);
              }
              isRegionEligible = !!matchedLga.is_active;
            } else if (lgaRows.length > 0 && !effectiveCity) {
              // State has LGAs but no city provided. Need LGA
              // Don't block, just mark ineligible
              isRegionEligible = false;
            } else {
              // State-level only row (non-Lagos). Check is_active
              isRegionEligible = !!stateRows[0].is_active;
            }
          }

          if (stateName !== undefined) updates.state_name = stateName;
          if (cityName !== undefined) updates.city_name = cityName;
          updates.is_region_eligible = isRegionEligible;
        }

        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "No valid profile fields provided" }, 400);
        }

        const { data: updatedProfile, error } = await adminClient
          .from("profiles")
          .update(updates)
          .eq("id", userId)
          .select("id, full_name, email, phone, avatar_url, country_code, state_name, city_name, is_region_eligible, created_at")
          .single();

        if (error) return jsonResponse({ error: error.message }, 400);

        // Recompute verification level if location changed
        if (hasLocationUpdate) {
          const { data: levelData } = await adminClient.rpc("compute_verification_level", {
            _user_id: userId,
          });
          if (levelData) {
            await adminClient
              .from("account_verifications")
              .update({ verification_level: levelData })
              .eq("user_id", userId);
          }
        }

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
