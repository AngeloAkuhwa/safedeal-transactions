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

const ACTION_TO_STATUS: Record<string, string> = {
  processing: "seller_preparing_delivery",
  dispatched: "seller_dispatched",
  delivered: "delivered_awaiting_verification",
};

const ACTION_TO_EVENT: Record<string, string> = {
  processing: "seller_preparing_delivery",
  dispatched: "seller_dispatched",
  delivered: "delivered",
};

const ACTION_TO_DELIVERY_STATUS: Record<string, string> = {
  processing: "processing",
  dispatched: "dispatched",
  delivered: "delivered",
};

const ALLOWED_FROM: Record<string, string[]> = {
  processing: ["payment_secured", "seller_preparing_delivery"],
  dispatched: ["payment_secured", "seller_preparing_delivery"],
  delivered: ["seller_dispatched", "seller_preparing_delivery"],
};

function getProofType(mimeType: string | null): string {
  if (!mimeType) return "other";
  if (mimeType.startsWith("video/")) return "shipment_video";
  if (mimeType.startsWith("image/")) return "package_photo";
  return "other";
}

function generateHandoffCode(): string {
  // 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Generate a 32-char URL-safe token for rider confirmation */
function generateRiderToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // Base64url encode
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const { data: hasRole } = await admin.rpc("has_role", { _user_id: userId, _role: "seller" });
    if (!hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    const body = await req.json();
    const {
      transaction_id,
      action,
      tracking_number,
      delivery_notes,
      file_ids,
      // New method-aware fields
      courier_name,
      tracking_url,
      dispatch_note,
      dispatch_evidence_file_ids,
      scheduled_handoff_at,
      pickup_ready_at,
      rider_name,
      rider_phone,
      handoff_code_input,
    } = body;

    if (!transaction_id) return jsonResponse({ error: "transaction_id required" }, 400);
    if (!action || !ACTION_TO_STATUS[action]) {
      return jsonResponse({ error: "Invalid action. Must be: processing, dispatched, delivered" }, 400);
    }

    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select("id, status, money_status, seller_id, buyer_id")
      .eq("id", transaction_id)
      .single();

    if (txErr || !tx) return jsonResponse({ error: "Transaction not found" }, 404);
    if (tx.seller_id !== userId) return jsonResponse({ error: "Not authorized" }, 403);

    const { data: terms } = await admin
      .from("transaction_delivery_terms")
      .select("delivery_method, verification_window_hours")
      .eq("transaction_id", transaction_id)
      .maybeSingle();

    // Fail closed: an unset delivery method is not a courier shipment. We
    // refuse the transition rather than demanding courier evidence.
    // The same applies to the verification window: it is the buyer's agreed
    // inspection clock, so an absent one is refused rather than set to 72h.
    const deliveryMethod = terms?.delivery_method ?? null;
    const rawWindow = terms?.verification_window_hours;
    const verificationWindowHours =
      rawWindow != null && Number.isFinite(Number(rawWindow)) && Number(rawWindow) > 0
        ? Number(rawWindow)
        : null;

    // State transition validation
    const allowedFrom = ALLOWED_FROM[action];
    if (!allowedFrom.includes(tx.status)) {
      return jsonResponse({
        error: `Cannot transition from '${tx.status}' via '${action}'. Allowed from: ${allowedFrom.join(", ")}`,
      }, 400);
    }

    // ============= METHOD-AWARE VALIDATION =============
    if (action === "dispatched" || action === "delivered") {
      if (!deliveryMethod) {
        return jsonResponse({
          error: "This transaction has no delivery method set. Set the delivery terms before updating fulfilment.",
        }, 400);
      }
    }

    // Marking delivered starts the buyer's inspection clock. Without an agreed
    // window there is no clock to start. Refuse instead of inventing one.
    if (action === "delivered" && verificationWindowHours === null) {
      return jsonResponse({
        error:
          "This transaction has no agreed verification window. SafeDeal support must set the delivery terms before it can be marked delivered.",
        code: "verification_window_unresolved",
      }, 409);
    }

    if (action === "dispatched") {
      if (deliveryMethod === "courier") {
        if (!tracking_number?.trim()) {
          return jsonResponse({ error: "Tracking number is required for courier dispatch" }, 400);
        }
      } else if (deliveryMethod === "pickup") {
        if (!pickup_ready_at) {
          return jsonResponse({ error: "Pickup-ready timestamp is required for pickup dispatch" }, 400);
        }
      } else if (deliveryMethod === "meetup") {
        if (!scheduled_handoff_at) {
          return jsonResponse({ error: "Scheduled handoff time is required for meetup dispatch" }, 400);
        }
      } else if (deliveryMethod === "hand_delivery") {
        if (!rider_name?.trim()) {
          return jsonResponse({ error: "Rider/courier name is required for hand-delivery dispatch" }, 400);
        }
      }
    }

    let handoffCodeVerifiedAt: string | null = null;
    if (action === "delivered") {
      if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
        return jsonResponse({ error: "At least one evidence file is required for delivered status" }, 400);
      }
      if (deliveryMethod === "courier" && !tracking_number?.trim()) {
        return jsonResponse({ error: "Tracking number is required for courier deliveries" }, 400);
      }

      // Pickup/meetup: cross-check buyer's handoff code
      if (deliveryMethod === "pickup" || deliveryMethod === "meetup") {
        const input = typeof handoff_code_input === "string" ? handoff_code_input.trim() : "";
        if (!input || input.length !== 6) {
          return jsonResponse({ error: "A 6-digit handoff code is required to confirm in-person delivery." }, 400);
        }

        const { data: trackRow } = await admin
          .from("delivery_tracking_details")
          .select("signature_name")
          .eq("transaction_id", transaction_id)
          .maybeSingle();

        const stored = trackRow?.signature_name ?? null;
        if (!stored) {
          return jsonResponse({
            error: "No handoff code on file. Re-issue the code via Mark as Dispatched.",
          }, 400);
        }

        // Stored format: "HANDOFF:123456"
        const storedCode = stored.startsWith("HANDOFF:") ? stored.slice("HANDOFF:".length) : stored;
        if (storedCode.trim().toUpperCase() !== input.toUpperCase()) {
          return jsonResponse({ error: "Handoff code does not match. Ask the buyer to re-read the code from their order page." }, 400);
        }

        handoffCodeVerifiedAt = new Date().toISOString();
      }
    }

    // Validate file ownership for delivery proof files
    const validFileIds: string[] = [];
    if (file_ids && Array.isArray(file_ids) && file_ids.length > 0) {
      const { data: files, error: filesErr } = await admin
        .from("files")
        .select("id, mime_type, uploaded_by_user_id")
        .in("id", file_ids);

      if (filesErr) {
        console.error("File validation error:", filesErr);
        return jsonResponse({ error: "Failed to validate files" }, 500);
      }

      for (const fid of file_ids) {
        const file = files?.find((f: { id: string }) => f.id === fid);
        if (!file) return jsonResponse({ error: `File ${fid} not found` }, 400);
        if (file.uploaded_by_user_id !== userId) {
          return jsonResponse({ error: `File ${fid} does not belong to you` }, 403);
        }
        validFileIds.push(fid);
      }
    }

    // Validate dispatch evidence file ownership
    const validDispatchFileIds: string[] = [];
    if (dispatch_evidence_file_ids && Array.isArray(dispatch_evidence_file_ids) && dispatch_evidence_file_ids.length > 0) {
      const { data: dFiles, error: dErr } = await admin
        .from("files")
        .select("id, mime_type, uploaded_by_user_id")
        .in("id", dispatch_evidence_file_ids);
      if (dErr) {
        console.error("Dispatch file validation error:", dErr);
        return jsonResponse({ error: "Failed to validate dispatch evidence files" }, 500);
      }
      for (const fid of dispatch_evidence_file_ids) {
        const f = dFiles?.find((x: { id: string }) => x.id === fid);
        if (!f) return jsonResponse({ error: `Dispatch file ${fid} not found` }, 400);
        if (f.uploaded_by_user_id !== userId) {
          return jsonResponse({ error: `Dispatch file ${fid} does not belong to you` }, 403);
        }
        validDispatchFileIds.push(fid);
      }
    }

    const newStatus = ACTION_TO_STATUS[action];
    const now = new Date().toISOString();

    // Intermediate transitions (state-machine compliance)
    const needsIntermediateStep =
      tx.status === "payment_secured" && (action === "dispatched" || action === "delivered");

    if (needsIntermediateStep) {
      const { error: intermediateErr } = await admin
        .from("transactions")
        .update({ status: "seller_preparing_delivery" })
        .eq("id", transaction_id);
      if (intermediateErr) {
        console.error("Intermediate transition error:", intermediateErr);
        return jsonResponse({ error: `Failed intermediate transition: ${intermediateErr.message}` }, 500);
      }
      await admin.from("transaction_status_history").insert({
        transaction_id,
        old_status: tx.status,
        new_status: "seller_preparing_delivery",
        changed_by_user_id: userId,
        reason: "Auto-transition for delivery update",
      });
    }

    const needsDispatchStep =
      (tx.status === "payment_secured" || tx.status === "seller_preparing_delivery") && action === "delivered";

    if (needsDispatchStep) {
      const { error: dispatchErr } = await admin
        .from("transactions")
        .update({ status: "seller_dispatched" })
        .eq("id", transaction_id);
      if (dispatchErr) {
        console.error("Dispatch intermediate error:", dispatchErr);
        return jsonResponse({ error: `Failed dispatch transition: ${dispatchErr.message}` }, 500);
      }
      await admin.from("transaction_status_history").insert({
        transaction_id,
        old_status: "seller_preparing_delivery",
        new_status: "seller_dispatched",
        changed_by_user_id: userId,
        reason: "Auto-transition for delivery update",
      });
    }

    // Final transition to target status
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (action === "delivered") {
      updatePayload.delivered_at = now;
      updatePayload.verification_deadline_at = new Date(Date.now() + verificationWindowHours! * 60 * 60 * 1000).toISOString();
    }

    const { error: updateErr } = await admin
      .from("transactions")
      .update(updatePayload)
      .eq("id", transaction_id);

    if (updateErr) {
      console.error("Transaction update error:", updateErr);
      return jsonResponse({ error: `Failed to update status: ${updateErr.message}` }, 500);
    }

    // Generate handoff code for pickup/meetup at dispatch time
    let handoffCode: string | null = null;
    if (action === "dispatched" && (deliveryMethod === "pickup" || deliveryMethod === "meetup")) {
      handoffCode = generateHandoffCode();
    }

    // Generate rider confirmation token at dispatch time (Batch 7)
    let riderToken: string | null = null;
    let riderConfirmationUrl: string | null = null;
    if (action === "dispatched" && tx.buyer_id) {
      riderToken = generateRiderToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      // Resolve canonical URL: PUBLIC_APP_URL > client app_origin > origin header
      const publicBase = Deno.env.get("PUBLIC_APP_URL");
      const clientOrigin = (body.app_origin as string | undefined)?.replace(/\/$/, "");
      const headerOrigin = req.headers.get("origin") ?? req.headers.get("referer")?.replace(/\/[^/]*$/, "") ?? "";
      const appBase = publicBase || clientOrigin || headerOrigin;
      const persistedUrl = appBase ? `${appBase}/delivery/confirm/${riderToken}` : null;

      const { error: tokenErr } = await admin
        .from("delivery_confirmation_tokens")
        .insert({
          transaction_id,
          seller_id: userId,
          buyer_id: tx.buyer_id,
          token: riderToken,
          expires_at: expiresAt,
          status: "active",
          confirmation_url: persistedUrl,
        });
      if (tokenErr) {
        console.error("Failed to issue rider token:", tokenErr);
        riderToken = null;
      } else {
        riderConfirmationUrl = persistedUrl ?? `/delivery/confirm/${riderToken}`;
      }
    }

    const parallelOps: Promise<unknown>[] = [];

    parallelOps.push(
      admin.from("transaction_status_history").insert({
        transaction_id,
        old_status: tx.status,
        new_status: newStatus,
        changed_by_user_id: userId,
        reason: dispatch_note || delivery_notes || `Seller updated to ${action}`,
      }),
    );

    parallelOps.push(
      admin.from("transaction_events").insert({
        transaction_id,
        event_type: ACTION_TO_EVENT[action],
        actor_user_id: userId,
        actor_role: "seller",
        event_data: {
          action,
          delivery_method: deliveryMethod,
          tracking_number: tracking_number || null,
          tracking_url: tracking_url || null,
          courier_name: courier_name || null,
          rider_name: rider_name || null,
          rider_phone: rider_phone || null,
          scheduled_handoff_at: scheduled_handoff_at || null,
          pickup_ready_at: pickup_ready_at || null,
          dispatch_note: dispatch_note || null,
          delivery_notes: delivery_notes || null,
          handoff_code: handoffCode,
          file_count: validFileIds.length,
          dispatch_evidence_count: validDispatchFileIds.length,
        },
      }),
    );

    parallelOps.push(
      admin.from("delivery_updates").insert({
        transaction_id,
        status: ACTION_TO_DELIVERY_STATUS[action],
        notes: dispatch_note || delivery_notes || null,
        updated_by_user_id: userId,
      }),
    );

    // Audit handoff code verification as its own event
    if (handoffCodeVerifiedAt) {
      parallelOps.push(
        admin.from("transaction_events").insert({
          transaction_id,
          event_type: "handoff_code_verified",
          actor_user_id: userId,
          actor_role: "seller",
          event_data: {
            method: deliveryMethod,
            verified_at: handoffCodeVerifiedAt,
          },
        }),
      );
    }

    // Upsert delivery_tracking_details with method-aware fields
    if (
      tracking_number?.trim() ||
      courier_name?.trim() ||
      tracking_url?.trim() ||
      handoffCode ||
      action === "dispatched" ||
      action === "delivered"
    ) {
      // IMPORTANT: only set fields the caller actually provided so a later
      // `delivered` upsert doesn't wipe out values written at `dispatched` time.
      const trackingPayload: Record<string, unknown> = { transaction_id };
      if (tracking_number?.trim()) trackingPayload.tracking_number = tracking_number.trim();
      const resolvedCourier = courier_name?.trim() || rider_name?.trim();
      if (resolvedCourier) trackingPayload.courier_name = resolvedCourier;
      if (tracking_url?.trim()) trackingPayload.tracking_url = tracking_url.trim();
      if (action === "dispatched") {
        trackingPayload.shipped_at = pickup_ready_at || scheduled_handoff_at || now;
      }
      if (action === "delivered") {
        trackingPayload.delivered_at = now;
      }
      // Reuse signature_name column to store handoff code (existing column, no schema change needed)
      if (handoffCode) {
        trackingPayload.signature_name = `HANDOFF:${handoffCode}`;
      }

      parallelOps.push(
        admin.from("delivery_tracking_details").upsert(trackingPayload, { onConflict: "transaction_id" }),
      );
    }

    // Delivery proof files (delivered evidence)
    if (validFileIds.length > 0) {
      const { data: fileDetails } = await admin
        .from("files")
        .select("id, mime_type")
        .in("id", validFileIds);

      const proofInserts = validFileIds.map((fid) => {
        const fileDetail = fileDetails?.find((f: { id: string }) => f.id === fid);
        return {
          transaction_id,
          file_id: fid,
          proof_type: getProofType(fileDetail?.mime_type ?? null),
          uploaded_by_user_id: userId,
        };
      });

      parallelOps.push(admin.from("delivery_proof_files").insert(proofInserts));
      parallelOps.push(
        admin.from("files")
          .update({ is_temporary: false, context_type: "delivery_proof", retention_category: "delivery_proof" })
          .in("id", validFileIds),
      );
    }

    // Dispatch evidence files (dispatch-time uploads, separate proof_type)
    if (validDispatchFileIds.length > 0) {
      const dispatchInserts = validDispatchFileIds.map((fid) => ({
        transaction_id,
        file_id: fid,
        proof_type: "dispatch_evidence" as const,
        uploaded_by_user_id: userId,
      }));
      parallelOps.push(admin.from("delivery_proof_files").insert(dispatchInserts));
      parallelOps.push(
        admin.from("files")
          .update({ is_temporary: false, context_type: "delivery_proof", retention_category: "delivery_proof" })
          .in("id", validDispatchFileIds),
      );
    }

    if (action === "delivered") {
      parallelOps.push(
        admin.from("delivery_confirmations").upsert({
          transaction_id,
          seller_marked_delivered_at: now,
        }, { onConflict: "transaction_id" }),
      );
    }

    // Buyer notification
    if (tx.buyer_id && (action === "dispatched" || action === "delivered")) {
      let notifTitle = "";
      let notifMessage = "";
      if (action === "dispatched") {
        if (deliveryMethod === "pickup") {
          notifTitle = "Your item is ready for pickup";
          notifMessage = `The seller has marked your item ready for pickup. Use code ${handoffCode} at handoff.`;
        } else if (deliveryMethod === "meetup") {
          notifTitle = "Meetup scheduled for your item";
          notifMessage = `The seller scheduled a handoff. Use code ${handoffCode} when meeting.`;
        } else if (deliveryMethod === "hand_delivery") {
          notifTitle = "Your item has been dispatched";
          notifMessage = `Your item is being hand-delivered${rider_name ? ` by ${rider_name}` : ""}. You will be notified when it arrives.`;
        } else {
          notifTitle = "Your item has been dispatched";
          notifMessage = `Your item has been shipped${courier_name ? ` via ${courier_name}` : ""}${tracking_number ? ` (tracking ${tracking_number})` : ""}. You will be notified when it arrives.`;
        }
      } else {
        notifTitle = "Your item has been marked as delivered";
        notifMessage = `Your item has been marked as delivered. Please verify within ${verificationWindowHours} hours.`;
      }

      parallelOps.push(
        admin.from("notifications").insert({
          user_id: tx.buyer_id,
          type: "delivery_update",
          channel: "in_app",
          title: notifTitle,
          message: notifMessage,
          related_transaction_id: transaction_id,
          status: "pending",
        }),
      );
    }

    const results = await Promise.allSettled(parallelOps);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error("Some parallel operations failed:", failures);
    }

    return jsonResponse({
      success: true,
      new_status: newStatus,
      delivered_at: action === "delivered" ? now : null,
      verification_deadline_at: action === "delivered"
        ? new Date(Date.now() + verificationWindowHours! * 60 * 60 * 1000).toISOString()
        : null,
      handoff_code: handoffCode,
      rider_token: riderToken,
      rider_confirmation_url: riderConfirmationUrl,
    });
  } catch (err) {
    console.error("update-delivery-status error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
