// Public (no JWT) endpoint: rider submits OTP entered by buyer to confirm delivery.
// Verifies OTP against phone_otp_codes for the buyer, then transitions transaction to delivered_awaiting_verification.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { evaluateDeliveryConfirmGuard, isDeliveryAlreadyDone } from "../_shared/delivery-confirm.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const otpCode = typeof body?.otp_code === "string" ? body.otp_code.trim() : "";

    if (!token) return jsonResponse({ error: "Token required" }, 400);
    if (!/^\d{6}$/.test(otpCode)) return jsonResponse({ error: "OTP must be 6 digits" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Look up token
    const { data: tokenRow, error: tokenErr } = await admin
      .from("delivery_confirmation_tokens")
      .select("id, transaction_id, seller_id, buyer_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) {
      console.error("Token lookup error:", tokenErr);
      return jsonResponse({ error: "Lookup failed" }, 500);
    }
    if (!tokenRow) return jsonResponse({ error: "Invalid token" }, 404);
    if (tokenRow.status !== "active") return jsonResponse({ error: `Token is ${tokenRow.status}` }, 410);
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      await admin.from("delivery_confirmation_tokens").update({ status: "expired" }).eq("id", tokenRow.id);
      return jsonResponse({ error: "Token has expired" }, 410);
    }

    // Find latest unverified OTP for this buyer
    const { data: otpRecord } = await admin
      .from("phone_otp_codes")
      .select("id, code_hash, attempts, max_attempts, phone")
      .eq("user_id", tokenRow.buyer_id)
      .is("verified_at", null)
      .is("invalidated_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRecord) {
      return jsonResponse({ error: "No active code. Tap 'Send code' first." }, 400);
    }
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      return jsonResponse({ error: "Too many attempts. Request a new code." }, 400);
    }

    await admin
      .from("phone_otp_codes")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    const submittedHash = await sha256(otpCode);
    if (submittedHash !== otpRecord.code_hash) {
      const remaining = otpRecord.max_attempts - (otpRecord.attempts + 1);
      return jsonResponse({
        error: `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
      }, 400);
    }

    // OTP verified: mark used
    await admin
      .from("phone_otp_codes")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    // Fetch transaction
    const { data: tx } = await admin
      .from("transactions")
      .select("id, status, money_status, seller_id, buyer_id")
      .eq("id", tokenRow.transaction_id)
      .single();

    if (!tx) return jsonResponse({ error: "Transaction not found" }, 404);

    // Idempotency: if already delivered/awaiting/completed, just mark token used and succeed
    const alreadyDone = isDeliveryAlreadyDone(tx.status);

    // Guard: funds must actually be held in escrow before delivery can start the release clock.
    if (!alreadyDone) {
      const guardFailure = evaluateDeliveryConfirmGuard({ status: tx.status, money_status: tx.money_status });
      if (guardFailure) {
        return jsonResponse({ error: guardFailure.message, code: guardFailure.error }, guardFailure.http);
      }
    }

    const now = new Date().toISOString();

    const { data: terms } = await admin
      .from("transaction_delivery_terms")
      .select("verification_window_hours")
      .eq("transaction_id", tx.id)
      .maybeSingle();
    // FAIL CLOSED. The lock trigger no longer fabricates delivery terms, so a
    // missing verification window is a real unknown. Inventing 72h here would
    // hand the buyer a release deadline nobody agreed to and then notify both
    // parties about it. Refuse; the transaction is already flagged for review.
    const rawWindow = terms?.verification_window_hours;
    const verificationWindowHours =
      rawWindow != null && Number.isFinite(Number(rawWindow)) && Number(rawWindow) > 0
        ? Number(rawWindow)
        : null;
    if (!alreadyDone && verificationWindowHours === null) {
      return jsonResponse({
        error:
          "This transaction has no agreed verification window. SafeDeal support must set the delivery terms before delivery can be confirmed.",
        code: "verification_window_unresolved",
      }, 409);
    }

    if (!alreadyDone) {
      // Auto-walk state machine: payment_secured → preparing → dispatched → delivered_awaiting_verification
      const walk = async (target: string, from: string, reason: string) => {
        const { error } = await admin.from("transactions").update({ status: target }).eq("id", tx.id);
        if (error) throw new Error(`Walk failed ${from}→${target}: ${error.message}`);
        await admin.from("transaction_status_history").insert({
          transaction_id: tx.id,
          old_status: from,
          new_status: target,
          changed_by_user_id: null,
          reason,
        });
      };

      try {
        if (tx.status === "payment_secured") {
          await walk("seller_preparing_delivery", "payment_secured", "Auto: rider OTP confirmation");
          await walk("seller_dispatched", "seller_preparing_delivery", "Auto: rider OTP confirmation");
        } else if (tx.status === "seller_preparing_delivery") {
          await walk("seller_dispatched", "seller_preparing_delivery", "Auto: rider OTP confirmation");
        }

        // Final transition to delivered: optimistic lock on the expected current state.
        const verificationDeadline = new Date(Date.now() + verificationWindowHours! * 60 * 60 * 1000).toISOString();
        const { data: finalUpdated, error: finalErr } = await admin
          .from("transactions")
          .update({
            status: "delivered_awaiting_verification",
            delivered_at: now,
            verification_deadline_at: verificationDeadline,
          })
          .eq("id", tx.id)
          .eq("status", "seller_dispatched")
          .eq("money_status", "funds_held_in_escrow")
          .select("id")
          .maybeSingle();

        if (finalErr) {
          console.error("Final transition failed:", finalErr);
          return jsonResponse({ error: `Failed to mark delivered: ${finalErr.message}` }, 500);
        }

        if (!finalUpdated) {
          // Zero rows updated: someone else moved the transaction concurrently.
          // Treat as idempotent rather than force-writing the status.
          console.warn("delivery-token-confirm: concurrent state change, skipping force-write", { transaction_id: tx.id });
          return jsonResponse({
            success: true,
            already_delivered: true,
            message: "This delivery was already confirmed.",
          });
        }

        await admin.from("transaction_status_history").insert({
          transaction_id: tx.id,
          old_status: "seller_dispatched",
          new_status: "delivered_awaiting_verification",
          changed_by_user_id: null,
          reason: "Rider confirmed delivery via buyer OTP",
        });
      } catch (walkErr) {
        console.error(walkErr);
        return jsonResponse({ error: walkErr instanceof Error ? walkErr.message : "State transition failed" }, 500);
      }
    }

    // Mark token used
    await admin
      .from("delivery_confirmation_tokens")
      .update({ status: "used", used_at: now, used_by_phone: otpRecord.phone })
      .eq("id", tokenRow.id);

    // Record delivery confirmation
    await admin
      .from("delivery_confirmations")
      .upsert({
        transaction_id: tx.id,
        system_delivery_marked_at: now,
      }, { onConflict: "transaction_id" });

    // Audit events
    await Promise.allSettled([
      admin.from("transaction_events").insert({
        transaction_id: tx.id,
        event_type: "delivered",
        actor_user_id: null,
        actor_role: "system",
        event_data: {
          source: "rider_otp_confirmation",
          token_id: tokenRow.id,
          buyer_phone_masked: otpRecord.phone.slice(0, 4) + "•••••" + otpRecord.phone.slice(-2),
        },
      }),
      admin.from("delivery_updates").insert({
        transaction_id: tx.id,
        status: "delivered",
        notes: "Confirmed by buyer OTP via rider link",
        updated_by_user_id: tx.seller_id,
      }),
      admin.from("notifications").insert({
        user_id: tx.buyer_id,
        type: "delivery_update",
        channel: "in_app",
        title: "Delivery confirmed",
        message: `You confirmed delivery via OTP. You have ${verificationWindowHours}h to verify the item is as described before funds are released.`,
        related_transaction_id: tx.id,
        status: "pending",
      }),
      admin.from("notifications").insert({
        user_id: tx.seller_id,
        type: "delivery_update",
        channel: "in_app",
        title: "Buyer confirmed delivery",
        message: `Delivery has been confirmed via OTP. The buyer now has ${verificationWindowHours}h to inspect the item.`,
        related_transaction_id: tx.id,
        status: "pending",
      }),
    ]);

    return jsonResponse({
      success: true,
      already_delivered: alreadyDone,
      message: alreadyDone
        ? "This delivery was already confirmed."
        : "Delivery confirmed. Thank you!",
    });
  } catch (err) {
    console.error("delivery-token-confirm error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
