import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computePricing } from "../_shared/pricing.ts";
import { loadPricingConfig } from "../_shared/settings-resolver.ts";
import { notifyUser, notifyOpsTeam } from "../_shared/notify.ts";
import { koboToNaira } from "../_shared/money.ts";
import { emitHighValueFlagIfNeeded } from "../_shared/security-resolver.ts";
import { verifyChargeAgainstSnapshot } from "../_shared/payment-capture-guard.ts";
import { isVendorPlanReference, captureVendorPlanPayment } from "../_shared/vendor-plan-capture.ts";

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
      // Duplicate event: already processed (or in flight). No-op.
      return new Response("OK", { status: 200 });
    }

    // 3. Process charge.success
    // 3a. Vendor plan / sachet purchases ride the same Paystack account but
    //     are NOT escrow payments: capture them separately and stop.
    if (eventType === "charge.success" && isVendorPlanReference(providerReference)) {
      const paidKobo = typeof payload.data?.amount === "number" ? payload.data.amount : null;
      const result = await captureVendorPlanPayment(supabase as any, providerReference!, paidKobo);
      await updateWebhookLog(supabase, providerReference, result.ok, `vendor plan capture: ${result.reason}`);
      return new Response("OK", { status: 200 });
    }

    if (eventType === "charge.success" && providerReference) {
      try {
        const now = new Date().toISOString();
        // Inline the verification logic (same as verify-paystack-payment)
        // Find payment record
        const { data: payment } = await supabase
          .from("payments")
          .select("id, transaction_id, status")
          .eq("provider_reference", providerReference)
          .maybeSingle();

        if (!payment) {
          console.warn(`Webhook: No payment found for reference ${providerReference}`);
          await updateWebhookLog(supabase, providerReference, true, "No payment record found: skipped");
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
          .select("currency_code, item_amount, platform_fee_amount, payment_processing_fee_amount, buyer_total_amount, seller_payout_amount")
          .eq("transaction_id", txId)
          .maybeSingle();

        // SNAPSHOT-FIRST: display the locked transaction_pricing row. Only
        // recompute (display only: the charge already happened) when no
        // snapshot row exists.
        const numW = (v: unknown) => (v === null || v === undefined ? null : Number(v));
        let pricing: {
          currency_code: string;
          item_amount: number;
          paystack_fee_amount: number;
          platform_fee_amount: number;
          service_fee_amount: number;
          /** Derived (service fee ÷ item amount); null when it cannot be derived. */
          service_fee_rate: number | null;
          total_amount: number;
        };
        if (pricingRow) {
          const rawProcessingFee = numW(pricingRow.payment_processing_fee_amount);
          const rawPlatformFee = numW(pricingRow.platform_fee_amount);
          const processingFee = rawProcessingFee ?? 0;
          const platformFee = rawPlatformFee ?? 0;
          const itemAmount = Number(pricingRow.item_amount) || 0;
          pricing = {
            currency_code: pricingRow.currency_code || "NGN",
            item_amount: itemAmount,
            paystack_fee_amount: processingFee,
            platform_fee_amount: platformFee,
            service_fee_amount: processingFee + platformFee,
            service_fee_rate:
              rawProcessingFee !== null && rawPlatformFee !== null && itemAmount > 0
                ? (rawProcessingFee + rawPlatformFee) / itemAmount
                : null,
            total_amount: numW(pricingRow.buyer_total_amount) ?? itemAmount + processingFee + platformFee,
          };
        } else {
          // FALLBACK: no snapshot row exists (should not happen). Recompute
          // using the seller's vendor config for display only.
          const recomputed = computePricing(
            koboToNaira(psData.amount) || 0,
            psData.currency || "NGN",
            "local",
            await loadPricingConfig(tx.seller_id),
          );
          pricing = {
            currency_code: recomputed.currency_code,
            item_amount: recomputed.item_amount,
            paystack_fee_amount: recomputed.paystack_fee_amount,
            platform_fee_amount: recomputed.platform_fee_amount,
            service_fee_amount: recomputed.service_fee_amount,
            service_fee_rate: recomputed.service_fee_rate,
            total_amount: recomputed.total_amount,
          };
        }

        // Payment capture goes through the same guarded routine the verify path
        // uses. Keyed on the Paystack event id, so verify + webhook racing on the
        // same payment records exactly one set of money movements.
        // AUTHORITATIVE amount + currency check against the locked snapshot —
        // identical rule to the verify path. Refuse capture on mismatch.
        if (pricingRow) {
          const guard = verifyChargeAgainstSnapshot(psData, pricingRow);
          if (!guard.ok) {
            await supabase
              .from("payments")
              .update({
                status: "failed",
                failed_at: new Date().toISOString(),
                failure_reason: "amount_mismatch",
                raw_payload: psData,
              })
              .eq("id", payment.id);
            await supabase.from("system_logs").insert({
              level: "error",
              service_name: "paystack-webhook",
              message: "amount_mismatch: capture refused",
              metadata: {
                payment_id: payment.id,
                transaction_id: txId,
                provider_reference: providerReference,
                reason: guard.reason,
                expected_kobo: guard.expectedKobo,
                charged_kobo: guard.chargedKobo,
                expected_currency: guard.expectedCurrency,
                charged_currency: guard.chargedCurrency,
              },
            });
            await updateWebhookLog(supabase, providerReference, false, "amount_mismatch: capture refused");
            return new Response("OK", { status: 200 });
          }
        } else {
          console.warn(
            `paystack-webhook: no pricing snapshot for transaction ${txId}: strict amount/currency check skipped (legacy fallback path)`,
          );
        }

        const captureEventId = String(psData.id ?? providerEventId ?? providerReference);
        const { error: captureErr } = await supabase.rpc("record_payment_capture_atomic", {
          p_payment_id: payment.id,
          p_provider_event_id: captureEventId,
          p_raw_payload: psData,
        });

        if (captureErr) {
          console.error("record_payment_capture_atomic failed (webhook):", captureErr);
          await updateWebhookLog(supabase, providerReference, false, captureErr.message || "capture_failed");
          return new Response("OK", { status: 200 });
        }

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
            .select("id, file_id, media_type, sort_order, files(file_url, secure_url, mime_type, original_file_name)")
            .eq("transaction_id", txId)
            .order("sort_order", { ascending: true }),
        ]);

        // Idempotent: a webhook + client-verify race must not create two
        // snapshots for the same transaction.
        const { data: existingSnapshot } = await supabase
          .from("transaction_agreement_snapshots")
          .select("id")
          .eq("transaction_id", txId)
          .maybeSingle();

        if (!existingSnapshot) {
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
        }

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
          title: "Payment Received: Begin Fulfillment",
          message: `The buyer has completed payment of ${pricing.currency_code} ${pricing.total_amount.toLocaleString()}. Please begin preparing the item for delivery.`,
          related_transaction_id: txId,
          status: "pending",
        });

        // Emit high-value flag if the settled total crosses the vendor/platform threshold.
        await emitHighValueFlagIfNeeded({
          transactionId: txId,
          buyerId: tx.buyer_id,
          sellerId: tx.seller_id,
          vendorId: tx.seller_id,
          amount: pricing.total_amount,
          currencyCode: pricing.currency_code,
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
      // Non-charge.success events. Just log
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
      await updateWebhookLog(supabase, reference, true, "transfer.success: no matching payout. Ignored");
      return;
    }
    if (payout.status === "completed") {
      await updateWebhookLog(supabase, reference, true, "transfer.success: already completed");
      return;
    }
    // Ledger invariant: `payout_debit` must be booked at NET
    // (`transaction_pricing.seller_payout_amount`), so that
    // payment_credit = payout_debit + fee_record reconciles without any
    // compensating adjustment. The pricing snapshot is the source of truth;
    // the payout row is only a mirror of it.
    const { data: pricingSnap } = await supabase
      .from("transaction_pricing")
      .select("seller_payout_amount")
      .eq("transaction_id", payout.transaction_id)
      .maybeSingle();
    const snapshotNet = (pricingSnap as any)?.seller_payout_amount != null
      ? Number((pricingSnap as any).seller_payout_amount)
      : null;
    const payoutRowAmount = Number(payout.amount);
    const amount = snapshotNet ?? payoutRowAmount;
    if (snapshotNet != null && Math.abs(snapshotNet - payoutRowAmount) > 0.005) {
      console.error(
        `[paystack-webhook] payout ${payout.id} amount ${payoutRowAmount} != snapshot net ${snapshotNet}; booking ledger at NET`,
      );
    }
    const eventId = String(payload.data?.id ?? reference);
    const { error } = await supabase.rpc("complete_payout_atomic", {
      p_payout_id: payout.id,
      p_amount: amount,
      p_provider_event_id: eventId,
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
      title: "Payout failed: review needed",
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
    const eventId = String(payload.data?.id ?? reference);
    const { error } = await supabase.rpc("reverse_payout_atomic", {
      p_payout_id: payout.id,
      p_amount: Number(payout.amount),
      p_reason: reason,
      p_provider_event_id: eventId,
    });
    if (error) {
      await updateWebhookLog(supabase, reference, false, `reverse_payout_atomic: ${error.message}`);
      return;
    }
    await notifyOpsTeam(supabase, {
      type: "security_alert",
      title: "Payout reversed: high severity",
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
    const { error } = await supabase.rpc("complete_refund_atomic", {
      p_refund_id: refund.id,
      p_provider_event_id: String(payload.data?.id ?? reference),
    });
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
