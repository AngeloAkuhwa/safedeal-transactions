// Public (no JWT) endpoint a rider opens with a delivery confirmation token.
// Returns minimal info about the delivery + triggers an OTP send to the buyer's phone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendSms } from "../_shared/sms.ts";

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

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function maskPhone(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\s+/g, "");
  if (cleaned.length < 4) return "****";
  return cleaned.slice(0, 4) + "•••••" + cleaned.slice(-2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const tokenFromQuery = url.searchParams.get("token");
    let tokenFromBody: string | null = null;
    let action: string = "lookup";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        tokenFromBody = typeof body?.token === "string" ? body.token : null;
        action = typeof body?.action === "string" ? body.action : "lookup";
      } catch {
        // ignore
      }
    }

    const token = (tokenFromQuery || tokenFromBody || "").trim();
    if (!token) return jsonResponse({ error: "Token required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: tokenRow, error: tokenErr } = await admin
      .from("delivery_confirmation_tokens")
      .select("id, transaction_id, seller_id, buyer_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) {
      console.error("Token lookup error:", tokenErr);
      return jsonResponse({ error: "Lookup failed" }, 500);
    }
    if (!tokenRow) return jsonResponse({ error: "Invalid or unknown token" }, 404);
    if (tokenRow.status !== "active") {
      return jsonResponse({ error: `Token is ${tokenRow.status}` }, 410);
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      await admin.from("delivery_confirmation_tokens").update({ status: "expired" }).eq("id", tokenRow.id);
      return jsonResponse({ error: "Token has expired" }, 410);
    }

    // Fetch transaction + buyer/seller + item info
    const [txRes, buyerRes, sellerRes, itemRes] = await Promise.all([
      admin.from("transactions").select("id, transaction_code, status").eq("id", tokenRow.transaction_id).maybeSingle(),
      admin.from("profiles").select("id, full_name, phone").eq("id", tokenRow.buyer_id).maybeSingle(),
      admin.from("profiles").select("id, full_name").eq("id", tokenRow.seller_id).maybeSingle(),
      admin.from("transaction_items").select("title").eq("transaction_id", tokenRow.transaction_id).limit(1).maybeSingle(),
    ]);

    if (txRes.error) {
      console.error("delivery-token-lookup: transactions fetch error:", txRes.error);
      return jsonResponse({ error: "Failed to load transaction" }, 500);
    }
    if (buyerRes.error) {
      console.error("delivery-token-lookup: buyer profile fetch error:", buyerRes.error);
    }
    if (sellerRes.error) {
      console.error("delivery-token-lookup: seller profile fetch error:", sellerRes.error);
    }
    if (itemRes.error) {
      console.warn("delivery-token-lookup: transaction_items fetch error (will fall back):", itemRes.error);
    }

    const tx = txRes.data;
    const buyer = buyerRes.data;
    const seller = sellerRes.data;
    const itemTitle = itemRes.data?.title || "Order item";

    if (!tx) {
      console.error("delivery-token-lookup: transaction row not found for token", { transaction_id: tokenRow.transaction_id });
      return jsonResponse({ error: "Transaction not found" }, 404);
    }

    const buyerPhone = buyer?.phone ?? null;
    const masked = buyerPhone ? maskPhone(buyerPhone) : null;

    // Action: just return info
    if (action === "lookup") {
      return jsonResponse({
        success: true,
        transaction_code: tx.transaction_code,
        item_title: itemTitle,
        seller_name: seller?.full_name ?? "Seller",
        buyer_name_first: (buyer?.full_name ?? "").split(" ")[0] || "Buyer",
        masked_buyer_phone: masked,
        has_phone: !!buyerPhone,
        token_status: tokenRow.status,
      });
    }

    // Action: send_otp: generate code & store in phone_otp_codes for the buyer
    if (action === "send_otp") {
      if (!buyerPhone) {
        return jsonResponse({ error: "Buyer has no phone number on file. Ask the buyer to contact the seller." }, 400);
      }

      // Rate limit: 1 per 60s
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { data: recent } = await admin
        .from("phone_otp_codes")
        .select("id")
        .eq("phone", buyerPhone)
        .gte("created_at", oneMinuteAgo);
      if (recent && recent.length > 0) {
        return jsonResponse({ error: "Please wait 60 seconds before requesting a new code" }, 429);
      }

      // Hourly cap: 5 per hour for this token path (slightly higher than the 3/hr user-initiated cap)
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const { data: hourly } = await admin
        .from("phone_otp_codes")
        .select("id")
        .eq("phone", buyerPhone)
        .gte("created_at", oneHourAgo);
      if (hourly && hourly.length >= 5) {
        return jsonResponse({ error: "Too many OTP requests. Try again in an hour." }, 429);
      }

      // Invalidate previous unverified codes for the buyer
      await admin
        .from("phone_otp_codes")
        .update({ invalidated_at: new Date().toISOString() })
        .eq("user_id", tokenRow.buyer_id)
        .is("verified_at", null)
        .is("invalidated_at", null);

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await sha256(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: insertErr } = await admin.from("phone_otp_codes").insert({
        user_id: tokenRow.buyer_id,
        phone: buyerPhone,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

      if (insertErr) {
        console.error("OTP insert error:", insertErr);
        return jsonResponse({ error: "Failed to send code" }, 500);
      }

      // Deliver out-of-band only. The code is NEVER logged or returned.
      const smsResult = await sendSms(
        buyerPhone,
        `SafeDeal: ${code} is your delivery confirmation code for ${tx.transaction_code}. Share it only when you have the item in hand. Expires in 10 minutes.`,
      );
      console.log(
        `[delivery-token-lookup] OTP generated for buyer ${tokenRow.buyer_id} (tx ${tx.id}); sms_delivered=${smsResult.delivered} provider=${smsResult.provider}${smsResult.reason ? ` reason=${smsResult.reason}` : ""}`,
      );

      // Notify buyer in-app that a rider is asking for an OTP
      await admin.from("notifications").insert({
        user_id: tokenRow.buyer_id,
        type: "delivery_update",
        channel: "in_app",
        title: "Confirm delivery to release the OTP",
        message: `A rider is asking to confirm delivery of your order. We've sent a 6-digit code to your phone. Share it ONLY when you have the item in hand.`,
        related_transaction_id: tx.id,
        status: "pending",
      });

      return jsonResponse({
        success: true,
        masked_buyer_phone: masked,
        expires_in: 600,
        sms_delivered: smsResult.delivered,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("delivery-token-lookup error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
