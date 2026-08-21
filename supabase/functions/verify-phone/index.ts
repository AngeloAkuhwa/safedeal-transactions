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

/** SHA-256 hash a string and return hex */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Validate Nigerian phone format: +234XXXXXXXXXX or 0XXXXXXXXXX */
function isValidNigerianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^\+234\d{10}$/.test(cleaned) || /^0\d{10}$/.test(cleaned);
}

/** Normalize phone to +234 format */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("0")) {
    return "+234" + cleaned.slice(1);
  }
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const action = body?.action;

    // ── send_otp ──
    if (action === "send_otp") {
      const phone = body.phone;
      if (typeof phone !== "string" || !phone.trim()) {
        return jsonResponse({ error: "Phone number is required" }, 400);
      }

      if (!isValidNigerianPhone(phone)) {
        return jsonResponse({ error: "Invalid Nigerian phone number. Use +234XXXXXXXXXX or 0XXXXXXXXXX format" }, 400);
      }

      const normalizedPhone = normalizePhone(phone);

      // Rate limit: max 1 in last 60 seconds (resend cooldown)
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { data: recentCodes } = await supabase
        .from("phone_otp_codes")
        .select("id")
        .eq("phone", normalizedPhone)
        .gte("created_at", oneMinuteAgo);

      if (recentCodes && recentCodes.length > 0) {
        return jsonResponse({ error: "Please wait 60 seconds before requesting a new code" }, 429);
      }

      // Rate limit: max 3 in last 60 minutes
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const { data: hourCodes } = await supabase
        .from("phone_otp_codes")
        .select("id")
        .eq("phone", normalizedPhone)
        .gte("created_at", oneHourAgo);

      if (hourCodes && hourCodes.length >= 3) {
        return jsonResponse({ error: "Too many OTP requests. Please try again in an hour" }, 429);
      }

      // Invalidate all previous unverified codes for this user
      await supabase
        .from("phone_otp_codes")
        .update({ invalidated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("verified_at", null)
        .is("invalidated_at", null);

      // Generate 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await sha256(code);

      // Store hashed code
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
      const { error: insertErr } = await supabase
        .from("phone_otp_codes")
        .insert({
          user_id: userId,
          phone: normalizedPhone,
          code_hash: codeHash,
          expires_at: expiresAt,
        });

      if (insertErr) {
        console.error("OTP insert error:", insertErr);
        return jsonResponse({ error: "Failed to generate OTP" }, 500);
      }

      // Save phone to profile (capture even before verification)
      await supabase
        .from("profiles")
        .update({ phone: normalizedPhone })
        .eq("id", userId);

      // TODO: Integrate Termii/Africa's Talking for real SMS delivery
      // For dev: return the OTP in the response
      console.log(`[DEV] OTP for ${normalizedPhone}: ${code}`);

      return jsonResponse({
        success: true,
        expires_in: 600,
        message: "OTP sent",
        // DEV ONLY: remove in production
        dev_otp: code,
      });
    }

    // ── verify_otp ──
    if (action === "verify_otp") {
      const code = body.code;
      if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        return jsonResponse({ error: "Code must be exactly 6 digits" }, 400);
      }

      // Find latest unexpired, non-invalidated, unverified code for this user
      const { data: otpRecord, error: otpErr } = await supabase
        .from("phone_otp_codes")
        .select("*")
        .eq("user_id", userId)
        .is("verified_at", null)
        .is("invalidated_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpErr) {
        console.error("OTP lookup error:", otpErr);
        return jsonResponse({ error: "Failed to verify OTP" }, 500);
      }

      if (!otpRecord) {
        return jsonResponse({ error: "No pending OTP. Request a new code." }, 400);
      }

      if (otpRecord.attempts >= otpRecord.max_attempts) {
        return jsonResponse({ error: "Too many attempts. Request a new code." }, 400);
      }

      // Increment attempts
      await supabase
        .from("phone_otp_codes")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("id", otpRecord.id);

      // Compare hash
      const submittedHash = await sha256(code);
      if (submittedHash !== otpRecord.code_hash) {
        const remaining = otpRecord.max_attempts - (otpRecord.attempts + 1);
        return jsonResponse({
          error: `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
        }, 400);
      }

      // Success: mark verified
      await supabase
        .from("phone_otp_codes")
        .update({ verified_at: new Date().toISOString() })
        .eq("id", otpRecord.id);

      // Update account_verifications
      await supabase
        .from("account_verifications")
        .update({ phone_verified: true })
        .eq("user_id", userId);

      // Recompute verification level
      const { data: levelData } = await supabase.rpc("compute_verification_level", {
        _user_id: userId,
      });

      const newLevel = levelData || "unverified";
      await supabase
        .from("account_verifications")
        .update({ verification_level: newLevel })
        .eq("user_id", userId);

      return jsonResponse({
        success: true,
        phone_verified: true,
        verification_level: newLevel,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("verify-phone error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
