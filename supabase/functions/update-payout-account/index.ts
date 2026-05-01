import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createTransferRecipient } from "../_shared/paystack.ts";
import { logEdgeError } from "../_shared/log-error.ts";

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

    // Phase B7: if seller is editing an already-verified account, immediately
    // park it in `requires_update` and unverify so any in-flight release calls
    // see the account as not-ready. The new verification below will flip it
    // back to `verified` on success.
    const { data: existing } = await adminClient
      .from("payout_accounts")
      .select("id, verification_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing && (existing as any).verification_status === "verified") {
      await adminClient
        .from("payout_accounts")
        .update({ verification_status: "requires_update" })
        .eq("user_id", userId);
      await adminClient
        .from("account_verifications")
        .update({ payout_verified: false })
        .eq("user_id", userId);
    }

    // 1) Verify with Paystack FIRST. The plaintext account number never
    //    touches our database — only Paystack receives it for recipient
    //    creation, and we persist the masked form.
    const paystackResult = await createTransferRecipient({
      type: "nuban",
      name: account_name.trim(),
      account_number: cleanNumber,
      bank_code: bank_code.trim(),
      currency: "NGN",
    }).catch((e) => ({ ok: false, status: 0, message: String(e?.message ?? e), raw: null }) as any);

    if (!paystackResult.ok) {
      // Network / 5xx — do NOT persist anything, surface a 502 so the
      // seller can retry. We still record the attempt for ops.
      if (!paystackResult.status || paystackResult.status >= 500) {
        await logEdgeError(adminClient, {
          function_name: "update-payout-account",
          user_id: userId,
          error_code: "paystack_unavailable",
          message: paystackResult.message ?? "paystack unreachable",
          http_status: paystackResult.status || 502,
          request_context: { bank_code, last4: cleanNumber.slice(-4) },
        });
        return jsonResponse({ error: "verification_unavailable" }, 502);
      }

      // 4xx — persist a failed verification so the UI can show the reason.
      const failMessage = paystackResult.message ?? "Bank account could not be verified";
      const { data: failed } = await adminClient
        .from("payout_accounts")
        .upsert(
          {
            user_id: userId,
            bank_code: bank_code.trim(),
            bank_name: bank_name.trim(),
            account_name: account_name.trim(),
            masked_account_number: maskedAccountNumber,
            provider: "paystack",
            provider_recipient_code: null,
            provider_recipient_id: null,
            verification_status: "failed",
            last_verification_error: failMessage,
            provider_response: paystackResult.raw as any,
          },
          { onConflict: "user_id" },
        )
        .select()
        .single();

      await adminClient
        .from("account_verifications")
        .update({ payout_verified: false })
        .eq("user_id", userId);

      await logEdgeError(adminClient, {
        function_name: "update-payout-account",
        user_id: userId,
        error_code: "paystack_4xx",
        message: failMessage,
        http_status: paystackResult.status,
        request_context: { bank_code, last4: cleanNumber.slice(-4) },
      });

      return jsonResponse({
        error: "verification_failed",
        paystack_error_message: failMessage,
        payout_account: {
          bank_name: failed?.bank_name,
          account_name: failed?.account_name,
          masked_account_number: failed?.masked_account_number,
          verification_status: "failed",
          last_verification_error: failMessage,
        },
      }, 400);
    }

    // 2) Paystack accepted — persist verified account.
    const recipientCode = paystackResult.data?.recipient_code ?? null;
    const recipientId = paystackResult.data?.id ? String(paystackResult.data.id) : null;

    const { data, error } = await adminClient
      .from("payout_accounts")
      .upsert(
        {
          user_id: userId,
          bank_code: bank_code.trim(),
          bank_name: bank_name.trim(),
          account_name: account_name.trim(),
          masked_account_number: maskedAccountNumber,
          provider: "paystack",
          provider_recipient_code: recipientCode,
          provider_recipient_id: recipientId,
          verification_status: "verified",
          last_verified_at: new Date().toISOString(),
          last_verification_error: null,
          provider_response: paystackResult.raw as any,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (error) {
      console.error("Upsert error:", error);
      return jsonResponse({ error: "Failed to save payout account" }, 500);
    }

    await adminClient
      .from("account_verifications")
      .update({ payout_verified: true })
      .eq("user_id", userId);

    // 3) Auto-unblock any payouts that were blocked solely because the
    //    seller had no verified payout account.
    await adminClient
      .from("payouts")
      .update({
        status: "awaiting_release",
        release_blocked: false,
        payout_blocked_reason: null,
      })
      .eq("seller_id", userId)
      .eq("status", "blocked")
      .eq("payout_blocked_reason", "payout_account_unverified");

    return jsonResponse({
      success: true,
      payout_account: {
        bank_name: data.bank_name,
        account_name: data.account_name,
        masked_account_number: data.masked_account_number,
        verification_status: data.verification_status,
        last_verified_at: data.last_verified_at,
        recipient_code_present: !!recipientCode,
      },
    });
  } catch (err) {
    console.error("update-payout-account error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
