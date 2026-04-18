import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computePricing } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * HMAC-SHA512 signature verification for Paystack webhooks.
 */
async function verifyPaystackSignature(body: string, signature: string): Promise<boolean> {
  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secretKey) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hexSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hexSig === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Paystack sends POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  try {
    // 1. Verify HMAC signature
    const signature = req.headers.get("x-paystack-signature") || "";
    const isValid = await verifyPaystackSignature(rawBody, signature);

    if (!isValid) {
      console.error("Invalid Paystack webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event || "unknown";
    const providerReference = payload.data?.reference || null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Log ALL webhook events
    await supabase.from("payment_webhook_logs").insert({
      provider: "paystack",
      event_type: eventType,
      provider_reference: providerReference,
      payload,
      processed_successfully: false,
    });

    // 3. Process charge.success
    if (eventType === "charge.success" && providerReference) {
      try {
        // Inline the verification logic (same as verify-paystack-payment)
        // Find payment record
        const { data: payment } = await supabase
          .from("payments")
          .select("id, transaction_id, status")
          .eq("provider_reference", providerReference)
          .maybeSingle();

        if (!payment) {
          console.warn(`Webhook: No payment found for reference ${providerReference}`);
          await updateWebhookLog(supabase, providerReference, true, "No payment record found — skipped");
          return new Response("OK", { status: 200 });
        }

        // Idempotent: already processed
        if (payment.status === "succeeded") {
          await updateWebhookLog(supabase, providerReference, true, "Already processed");
          return new Response("OK", { status: 200 });
        }

        // Verify with Paystack API (don't trust webhook payload alone)
        const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;
        const verifyRes = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(providerReference)}`,
          { headers: { Authorization: `Bearer ${paystackSecretKey}` } }
        );
        const verifyData = await verifyRes.json();

        if (!verifyData.status || verifyData.data?.status !== "success") {
          await updateWebhookLog(supabase, providerReference, false, "Paystack verify returned non-success");
          return new Response("OK", { status: 200 });
        }

        const psData = verifyData.data;
        const txId = payment.transaction_id;

        // Fetch transaction
        const { data: tx } = await supabase
          .from("transactions")
          .select("id, transaction_code, status, money_status, buyer_id, seller_id")
          .eq("id", txId)
          .single();

        if (!tx || tx.money_status === "funds_held_in_escrow") {
          await updateWebhookLog(supabase, providerReference, true, "Already in escrow or tx not found");
          return new Response("OK", { status: 200 });
        }

        if (tx.money_status !== "payment_pending") {
          await updateWebhookLog(supabase, providerReference, false, `Unexpected money_status: ${tx.money_status}`);
          return new Response("OK", { status: 200 });
        }

        // Fetch pricing
        const { data: pricingRow } = await supabase
          .from("transaction_pricing")
          .select("currency_code, item_amount")
          .eq("transaction_id", txId)
          .maybeSingle();

        if (!pricingRow) {
          await updateWebhookLog(supabase, providerReference, false, "Pricing not found");
          return new Response("OK", { status: 200 });
        }

        const pricing = computePricing(Number(pricingRow.item_amount) || 0, pricingRow.currency_code || "NGN");
        const now = new Date().toISOString();

        // Update payment
        await supabase.from("payments").update({
          status: "succeeded",
          captured_at: now,
          authorized_at: psData.paid_at || now,
          raw_payload: psData,
        }).eq("id", payment.id);

        // Update transaction
        await supabase.from("transactions").update({
          status: "payment_secured",
          money_status: "funds_held_in_escrow",
          agreement_locked_at: now,
        }).eq("id", txId);

        // Update escrow
        await supabase.from("escrow_states").update({
          state: "held",
          held_amount: pricing.item_amount,
          last_changed_at: now,
        }).eq("transaction_id", txId);

        // Ledger entries
        await supabase.from("escrow_ledger_entries").insert([
          {
            transaction_id: txId,
            entry_type: "payment_credit",
            currency_code: pricing.currency_code,
            amount: pricing.total_amount,
            balance_after: pricing.total_amount,
            reference_type: "payment",
            reference_id: payment.id,
            notes: `Buyer payment received (webhook): ${pricing.currency_code} ${pricing.total_amount}`,
            created_by_user_id: tx.buyer_id,
          },
          {
            transaction_id: txId,
            entry_type: "fee_record",
            currency_code: pricing.currency_code,
            amount: pricing.paystack_fee_amount,
            balance_after: pricing.total_amount - pricing.paystack_fee_amount,
            reference_type: "paystack_fee",
            notes: `Paystack processing fee: ${pricing.currency_code} ${pricing.paystack_fee_amount}`,
          },
          {
            transaction_id: txId,
            entry_type: "fee_record",
            currency_code: pricing.currency_code,
            amount: pricing.platform_fee_amount,
            balance_after: pricing.total_amount - pricing.paystack_fee_amount - pricing.platform_fee_amount,
            reference_type: "platform_fee",
            notes: `SafeDeal platform fee: ${pricing.currency_code} ${pricing.platform_fee_amount}`,
          },
          {
            transaction_id: txId,
            entry_type: "escrow_hold",
            currency_code: pricing.currency_code,
            amount: pricing.item_amount,
            balance_after: pricing.item_amount,
            reference_type: "escrow",
            notes: `Seller principal held in escrow: ${pricing.currency_code} ${pricing.item_amount}`,
          },
        ]);

        // Status history
        await supabase.from("transaction_status_history").insert({
          transaction_id: txId,
          old_status: tx.status,
          new_status: "payment_secured",
          reason: "Payment verified via Paystack webhook",
        });

        await supabase.from("money_status_history").insert({
          transaction_id: txId,
          old_status: "payment_pending",
          new_status: "funds_held_in_escrow",
          reason: "Payment verified via webhook and funds held in escrow",
        });

        // Agreement snapshot
        const [itemRes, deliveryRes, mediaRes] = await Promise.all([
          supabase.from("transaction_items").select("*").eq("transaction_id", txId).maybeSingle(),
          supabase.from("transaction_delivery_terms").select("*").eq("transaction_id", txId).maybeSingle(),
          supabase.from("transaction_media")
            .select("id, file_id, media_type, display_order, files(file_url, secure_url, mime_type, original_file_name)")
            .eq("transaction_id", txId)
            .order("display_order", { ascending: true }),
        ]);

        await supabase.from("transaction_agreement_snapshots").insert({
          transaction_id: txId,
          snapshot_json: {
            item: itemRes.data || null,
            pricing: {
              currency_code: pricing.currency_code,
              item_amount: pricing.item_amount,
              paystack_fee_amount: pricing.paystack_fee_amount,
              platform_fee_amount: pricing.platform_fee_amount,
              service_fee_amount: pricing.service_fee_amount,
              service_fee_rate: pricing.service_fee_rate,
              total_amount: pricing.total_amount,
            },
            delivery: deliveryRes.data || null,
            media: mediaRes.data || [],
            locked_at: now,
            payment_reference: providerReference,
          },
          locked_at: now,
          locked_by_user_id: tx.buyer_id,
        });

        // Transaction event
        await supabase.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "payment_received",
          actor_user_id: tx.buyer_id,
          description: `Payment of ${pricing.currency_code} ${pricing.total_amount} verified via webhook`,
          metadata: { reference: providerReference, amount: pricing.total_amount, source: "webhook" },
        });

        // Notify seller
        await supabase.from("notifications").insert({
          user_id: tx.seller_id,
          type: "payment",
          channel: "in_app",
          title: "Payment Received — Begin Fulfillment",
          message: `The buyer has completed payment of ${pricing.currency_code} ${pricing.total_amount.toLocaleString()}. Please begin preparing the item for delivery.`,
          related_transaction_id: txId,
          status: "pending",
        });

        // ── If this transaction was created from a private offer, mark offer purchased ──
        const { data: txOffer } = await supabase
          .from("transactions")
          .select("source_offer_id")
          .eq("id", txId)
          .maybeSingle();
        if (txOffer?.source_offer_id) {
          await supabase
            .from("buyer_specific_product_offers")
            .update({ status: "purchased", purchased_at: now })
            .eq("id", txOffer.source_offer_id);
          await supabase.from("offer_events").insert({
            offer_id: txOffer.source_offer_id,
            event_type: "purchased_via_payment",
            actor_user_id: tx.buyer_id,
            metadata: { transaction_id: txId, payment_reference: providerReference, amount: pricing.total_amount },
          });
        }

        await updateWebhookLog(supabase, providerReference, true, "Successfully processed charge.success");
      } catch (processErr) {
        console.error("Webhook processing error:", processErr);
        await updateWebhookLog(supabase, providerReference, false, processErr.message);
      }
    } else {
      // Non-charge.success events — just log
      await updateWebhookLog(supabase, providerReference, true, `Event ${eventType} logged (no action needed)`);
    }

    // Always return 200 to Paystack
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("paystack-webhook error:", err);
    // Still return 200 to prevent Paystack retries on our errors
    return new Response("OK", { status: 200 });
  }
});

async function updateWebhookLog(
  supabase: ReturnType<typeof createClient>,
  providerReference: string | null,
  success: boolean,
  message: string
) {
  if (!providerReference) return;
  await supabase
    .from("payment_webhook_logs")
    .update({
      processed_successfully: success,
      processed_at: new Date().toISOString(),
      error_message: success ? null : message,
    })
    .eq("provider_reference", providerReference)
    .order("created_at", { ascending: false })
    .limit(1);
}
