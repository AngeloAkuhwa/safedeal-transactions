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
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

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

    // Validate seller role
    const { data: hasRole } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (!hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // Parse and validate body
    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const { bank_code, bank_name, account_number, account_name } = body;

    // Validate required fields
    const errors: Record<string, string> = {};
    if (!bank_code || typeof bank_code !== "string" || bank_code.trim().length === 0) {
      errors.bank_code = "Bank code is required";
    }
    if (!bank_name || typeof bank_name !== "string" || bank_name.trim().length === 0) {
      errors.bank_name = "Bank name is required";
    }
    if (!account_number || typeof account_number !== "string") {
      errors.account_number = "Account number is required";
    } else if (!/^\d{10}$/.test(account_number.trim())) {
      errors.account_number = "Account number must be exactly 10 digits";
    }
    if (!account_name || typeof account_name !== "string" || account_name.trim().length < 2) {
      errors.account_name = "Account name is required (min 2 characters)";
    } else if (account_name.trim().length > 100) {
      errors.account_name = "Account name must be less than 100 characters";
    }

    if (Object.keys(errors).length > 0) {
      return jsonResponse({ error: "Validation failed", fields: errors }, 400);
    }

    // Mask account number — keep last 4 digits only
    const cleanNumber = account_number.trim();
    const maskedAccountNumber = `****** ${cleanNumber.slice(-4)}`;

    // Upsert payout account
    const { data, error } = await adminClient
      .from("payout_accounts")
      .upsert(
        {
          user_id: userId,
          bank_code: bank_code.trim(),
          bank_name: bank_name.trim(),
          account_name: account_name.trim(),
          masked_account_number: maskedAccountNumber,
          verification_status: "verified",
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Upsert error:", error);
      return jsonResponse({ error: "Failed to save payout account" }, 500);
    }

    // Also mark payout_verified in account_verifications
    await adminClient
      .from("account_verifications")
      .update({ payout_verified: true })
      .eq("user_id", userId);

    return jsonResponse({
      success: true,
      payout_account: {
        bank_name: data.bank_name,
        account_name: data.account_name,
        masked_account_number: data.masked_account_number,
        verification_status: data.verification_status,
        last_verified_at: data.last_verified_at,
      },
    });
  } catch (err) {
    console.error("update-payout-account error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
