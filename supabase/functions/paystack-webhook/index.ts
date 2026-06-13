import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computePricing } from "../_shared/pricing.ts";
import { notifyUser, notifyOpsTeam } from "../_shared/notify.ts";
import { koboToNaira } from "../_shared/money.ts";

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
    // Reference field varies by event type:
    //   charge.success   -> data.reference
    //   transfer.*       -> data.reference
    //   refund.processed -> data.transaction_reference (Paystack's docs)
    const providerReference =
      payload.data?.reference ||
      payload.data?.transaction_reference ||
      payload.data?.transfer?.reference ||
      null;
    const providerEventId = payload.data?.id ? String(payload.data.id) : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Idempotently log this event. The UNIQUE (provider, event_type,
    //    provider_reference) index lets a duplicate webhook short-circuit.
    const { error: logInsertErr } = await supabase
      .from("payment_webhook_logs")
      .insert({
        provider: "paystack",
        event_type: eventType,
        provider_reference: providerReference,
        provider_event_id: providerEventId,
        payload,
        processed_successfully: false,
      });
    if (logInsertErr && (logInsertErr as any).code === "23505") {
      // Duplicate event — already processed (or in flight). No-op.
      return new Response("OK", { status: 200 });
    }

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
          actor_role: "buyer",
          event_data: {
            description: `Payment of ${pricing.currency_code} ${pricing.total_amount} verified via webhook`,
            reference: providerReference,
            amount: pricing.total_amount,
            source: "webhook",
          },
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

        // Convert reserved stock → sold (idempotent)
        try {
          // Resolve authoritative per-product paid quantities.
          // Prefer checkout_session_items; fall back to (source_product_id +
          // transaction_items) for legacy/private-offer transactions.
          const perProduct = new Map<string, number>();

          const { data: csItems } = await supabase
            .from("checkout_session_items")
            .select("product_id, quantity")
            .eq("transaction_id", txId);

          if (csItems && csItems.length > 0) {
            for (const row of csItems) {
              if (!row.product_id) continue;
              perProduct.set(
                row.product_id,
                (perProduct.get(row.product_id) || 0) + (Number(row.quantity) || 0),
              );
            }
          } else {
            const { data: txWithProduct } = await supabase
              .from("transactions")
              .select("source_product_id")
              .eq("id", txId)
              .maybeSingle();
            if (txWithProduct?.source_product_id) {
              const { data: txItems } = await supabase
                .from("transaction_items")
                .select("quantity")
                .eq("transaction_id", txId);
              const totalQty = (txItems || []).reduce(
                (s: number, i: any) => s + (Number(i.quantity) || 0),
                0,
              );
              if (totalQty > 0) perProduct.set(txWithProduct.source_product_id, totalQty);
            }
          }

          for (const [productId, qty] of perProduct) {
            if (qty <= 0) continue;

            const { data: existingSoldLog } = await supabase
              .from("product_inventory_logs")
              .select("id, quantity_delta")
              .eq("product_id", productId)
              .eq("change_type", "sold")
              .eq("reference_type", "transaction")
              .eq("reference_id", txId)
              .maybeSingle();

            let toConvert = qty;
            if (existingSoldLog) {
              const alreadySold = Math.abs(Number(existingSoldLog.quantity_delta) || 0);
              if (alreadySold >= qty) continue;
              toConvert = qty - alreadySold;
            }

            const { data: prod } = await supabase
              .from("products")
              .select("stock_quantity, reserved_quantity")
              .eq("id", productId)
              .single();
            if (!prod) continue;

            const newStock = Math.max(0, prod.stock_quantity - toConvert);
            const newReserved = Math.max(0, prod.reserved_quantity - toConvert);
            await supabase
              .from("products")
              .update({ stock_quantity: newStock, reserved_quantity: newReserved })
              .eq("id", productId);
            await supabase.from("product_inventory_logs").insert({
              product_id: productId,
              change_type: "sold",
              quantity_delta: -toConvert,
              balance_after: newStock - newReserved,
              reference_type: "transaction",
              reference_id: txId,
              notes: existingSoldLog
                ? `Reserved stock top-up sold after qty reconciliation (+${toConvert}) (via webhook)`
                : "Reserved stock converted to sold (via webhook)",
            });
          }
        } catch (invErr) {
          console.error("webhook: inventory conversion failed (non-fatal):", invErr);
        }

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
    } else if (eventType === "transfer.success" && providerReference) {
      await handleTransferSuccess(supabase, payload, providerReference);
    } else if (eventType === "transfer.failed" && providerReference) {
      await handleTransferFailed(supabase, payload, providerReference);
    } else if (eventType === "transfer.reversed" && providerReference) {
      await handleTransferReversed(supabase, payload, providerReference);
    } else if (eventType === "refund.processed" && providerReference) {
      await handleRefundProcessed(supabase, payload, providerReference);
    } else if (eventType === "refund.failed" && providerReference) {
      await handleRefundFailed(supabase, payload, providerReference);
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

// ============================================================
// Transfer + refund handlers (Phase B)
// ============================================================

async function findPayoutByReference(
  supabase: ReturnType<typeof createClient>,
  reference: string,
) {
  // Our outbound reference convention: "payout_{payout_id}".
  // Retries append "_r{attempt}", e.g. "payout_{id}_r2".
  let payoutId: string | null = null;
  if (reference.startsWith("payout_")) {
    payoutId = reference.replace(/^payout_/, "").replace(/_r\d+$/, "");
  }

  if (payoutId) {
    const { data } = await supabase
      .from("payouts")
      .select("id, transaction_id, seller_id, amount, status, currency_code")
      .eq("id", payoutId)
      .maybeSingle();
    if (data) return data;
  }
  // Fallback: lookup by stored provider_reference
  const { data } = await supabase
    .from("payouts")
    .select("id, transaction_id, seller_id, amount, status, currency_code")
    .eq("provider_reference", reference)
    .maybeSingle();
  return data;
}

async function handleTransferSuccess(
  supabase: ReturnType<typeof createClient>,
  payload: any,
  reference: string,
) {
  try {
    const payout = await findPayoutByReference(supabase, reference);
    if (!payout) {
      await updateWebhookLog(supabase, reference, true, "transfer.success: no matching payout — ignored");
      return;
    }
    if (payout.status === "completed") {
      await updateWebhookLog(supabase, reference, true, "transfer.success: already completed");
      return;
    }
    const amount = Number(payout.amount);
    const { error } = await supabase.rpc("complete_payout_atomic", {
      p_payout_id: payout.id,
      p_amount: amount,
    });
    if (error) {
      await updateWebhookLog(supabase, reference, false, `complete_payout_atomic: ${error.message}`);
      return;
    }
    await notifyUser(supabase, {
      user_id: payout.seller_id,
      type: "payment_update",
      title: "Paid out successfully",
      message: `₦${amount.toLocaleString()} has been paid to your bank account.`,
      related_transaction_id: payout.transaction_id,
    });
    const { data: tx } = await supabase
      .from("transactions")
      .select("buyer_id")
      .eq("id", payout.transaction_id)
      .maybeSingle();
    if (tx?.buyer_id) {
      await notifyUser(supabase, {
        user_id: tx.buyer_id,
        type: "transaction_update",
        title: "Funds released to seller",
        message: "SafeDeal has released the funds for this transaction.",
        related_transaction_id: payout.transaction_id,
      });
    }
    await updateWebhookLog(supabase, reference, true, "transfer.success processed");
  } catch (e) {
    console.error("transfer.success handler error:", e);
    await updateWebhookLog(supabase, reference, false, String(e));
  }
}

async function handleTransferFailed(
  supabase: ReturnType<typeof createClient>,
  payload: any,
  reference: string,
) {
  try {
    const payout = await findPayoutByReference(supabase, reference);
    if (!payout) {
      await updateWebhookLog(supabase, reference, true, "transfer.failed: no matching payout");
      return;
    }
    const reason = payload.data?.failures?.[0]?.message ||
      payload.data?.reason ||
      payload.data?.message ||
      "transfer failed";
    const { data: maxRetriesSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "payout_max_retry_attempts")
      .maybeSingle();
    const maxRetries = Number(maxRetriesSetting?.setting_value ?? 3);
    const { error } = await supabase.rpc("fail_payout_atomic", {
      p_payout_id: payout.id,
      p_reason: reason,
      p_max_retries: maxRetries,
    });
    if (error) {
      await updateWebhookLog(supabase, reference, false, `fail_payout_atomic: ${error.message}`);
      return;
    }
    await notifyUser(supabase, {
      user_id: payout.seller_id,
      type: "payment_update",
      title: "Payment release failed",
      message: "SafeDeal is reviewing the issue. You may need to update your payout account.",
      related_transaction_id: payout.transaction_id,
    });
    await notifyOpsTeam(supabase, {
      type: "system_message",
      title: "Payout failed — review needed",
      message: `Payout ${payout.id} failed: ${reason}`,
      related_transaction_id: payout.transaction_id,
      metadata: { severity: "high", payout_id: payout.id },
    });
    await updateWebhookLog(supabase, reference, true, "transfer.failed processed");
  } catch (e) {
    console.error("transfer.failed handler error:", e);
    await updateWebhookLog(supabase, reference, false, String(e));
  }
}

async function handleTransferReversed(
  supabase: ReturnType<typeof createClient>,
  payload: any,
  reference: string,
) {
  try {
    const payout = await findPayoutByReference(supabase, reference);
    if (!payout) {
      await updateWebhookLog(supabase, reference, true, "transfer.reversed: no matching payout");
      return;
    }
    const reason = payload.data?.reason || payload.data?.message || "reversed by Paystack";
    const { error } = await supabase.rpc("reverse_payout_atomic", {
      p_payout_id: payout.id,
      p_amount: Number(payout.amount),
      p_reason: reason,
    });
    if (error) {
      await updateWebhookLog(supabase, reference, false, `reverse_payout_atomic: ${error.message}`);
      return;
    }
    await notifyOpsTeam(supabase, {
      type: "security_alert",
      title: "Payout reversed — high severity",
      message: `Payout ${payout.id} reversed by Paystack: ${reason}`,
      related_transaction_id: payout.transaction_id,
      metadata: { severity: "high", payout_id: payout.id, reason },
    });
    await updateWebhookLog(supabase, reference, true, "transfer.reversed processed");
  } catch (e) {
    console.error("transfer.reversed handler error:", e);
    await updateWebhookLog(supabase, reference, false, String(e));
  }
}

async function handleRefundProcessed(
  supabase: ReturnType<typeof createClient>,
  payload: any,
  reference: string,
) {
  try {
    // Find refund by either provider_reference or originating transaction reference
    let { data: refund } = await supabase
      .from("refunds")
      .select("id, transaction_id")
      .eq("provider_reference", reference)
      .maybeSingle();
    if (!refund) {
      // Fallback: find via the originating payment reference
      const { data: payment } = await supabase
        .from("payments")
        .select("transaction_id")
        .eq("provider_reference", reference)
        .maybeSingle();
      if (payment?.transaction_id) {
        const { data } = await supabase
          .from("refunds")
          .select("id, transaction_id")
          .eq("transaction_id", payment.transaction_id)
          .in("status", ["pending", "processing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        refund = data ?? null;
      }
    }
    if (!refund) {
      await updateWebhookLog(supabase, reference, true, "refund.processed: no matching refund");
      return;
    }
    const { error } = await supabase.rpc("complete_refund_atomic", { p_refund_id: refund.id });
    if (error) {
      await updateWebhookLog(supabase, reference, false, `complete_refund_atomic: ${error.message}`);
      return;
    }
    const { data: tx } = await supabase
      .from("transactions")
      .select("buyer_id, seller_id")
      .eq("id", refund.transaction_id)
      .maybeSingle();
    if (tx?.buyer_id) {
      await notifyUser(supabase, {
        user_id: tx.buyer_id,
        type: "transaction_update",
        title: "Refund processed",
        message: "Your refund has been processed and should appear in your account shortly.",
        related_transaction_id: refund.transaction_id,
      });
    }
    if (tx?.seller_id) {
      await notifyUser(supabase, {
        user_id: tx.seller_id,
        type: "transaction_update",
        title: "Buyer refunded",
        message: "SafeDeal has refunded the buyer for this transaction.",
        related_transaction_id: refund.transaction_id,
      });
    }
    await updateWebhookLog(supabase, reference, true, "refund.processed");
  } catch (e) {
    console.error("refund.processed handler error:", e);
    await updateWebhookLog(supabase, reference, false, String(e));
  }
}

async function handleRefundFailed(
  supabase: ReturnType<typeof createClient>,
  payload: any,
  reference: string,
) {
  try {
    const reason = payload.data?.reason || "refund failed";
    const { data: refund } = await supabase
      .from("refunds")
      .select("id")
      .eq("provider_reference", reference)
      .maybeSingle();
    if (refund) {
      await supabase.rpc("fail_refund_atomic", { p_refund_id: refund.id, p_reason: reason });
    }
    await notifyOpsTeam(supabase, {
      type: "security_alert",
      title: "Refund failed",
      message: `Refund failed: ${reason}`,
      metadata: { severity: "high", reference },
    });
    await updateWebhookLog(supabase, reference, true, "refund.failed logged");
  } catch (e) {
    console.error("refund.failed handler error:", e);
    await updateWebhookLog(supabase, reference, false, String(e));
  }
}
