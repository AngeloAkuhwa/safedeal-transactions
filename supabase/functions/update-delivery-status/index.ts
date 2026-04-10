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

// Map UI action to DB status enum
const ACTION_TO_STATUS: Record<string, string> = {
  processing: "seller_preparing_delivery",
  dispatched: "seller_dispatched",
  delivered: "delivered_awaiting_verification",
};

// Map UI action to transaction_event_type enum
const ACTION_TO_EVENT: Record<string, string> = {
  processing: "seller_preparing_delivery",
  dispatched: "seller_dispatched",
  delivered: "delivered",
};

// Map UI action to delivery_update_status enum
const ACTION_TO_DELIVERY_STATUS: Record<string, string> = {
  processing: "processing",
  dispatched: "dispatched",
  delivered: "delivered",
};

// Allowed source statuses for each action
const ALLOWED_FROM: Record<string, string[]> = {
  processing: ["payment_secured", "seller_preparing_delivery"],
  dispatched: ["payment_secured", "seller_preparing_delivery"],
  delivered: ["seller_dispatched", "seller_preparing_delivery"],
};

// Determine proof_type from mime_type
function getProofType(mimeType: string | null): string {
  if (!mimeType) return "other";
  if (mimeType.startsWith("video/")) return "shipment_video";
  if (mimeType.startsWith("image/")) return "package_photo";
  return "other";
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

    // Verify user
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    // Verify seller role
    const { data: hasRole } = await admin.rpc("has_role", { _user_id: userId, _role: "seller" });
    if (!hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    const body = await req.json();
    const { transaction_id, action, tracking_number, delivery_notes, file_ids } = body;

    if (!transaction_id) return jsonResponse({ error: "transaction_id required" }, 400);
    if (!action || !ACTION_TO_STATUS[action]) {
      return jsonResponse({ error: "Invalid action. Must be: processing, dispatched, delivered" }, 400);
    }

    // Fetch transaction
    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select("id, status, money_status, seller_id, buyer_id")
      .eq("id", transaction_id)
      .single();

    if (txErr || !tx) return jsonResponse({ error: "Transaction not found" }, 404);
    if (tx.seller_id !== userId) return jsonResponse({ error: "Not authorized" }, 403);

    // Fetch delivery terms
    const { data: terms } = await admin
      .from("transaction_delivery_terms")
      .select("delivery_method, verification_window_hours")
      .eq("transaction_id", transaction_id)
      .maybeSingle();

    const deliveryMethod = terms?.delivery_method ?? "courier";
    const verificationWindowHours = terms?.verification_window_hours ?? 72;
    const isCourier = deliveryMethod === "courier";

    // Validate state transition
    const allowedFrom = ALLOWED_FROM[action];
    if (!allowedFrom.includes(tx.status)) {
      return jsonResponse({
        error: `Cannot transition from '${tx.status}' via '${action}'. Allowed from: ${allowedFrom.join(", ")}`,
      }, 400);
    }

    // Action-specific validation
    if (action === "dispatched" && isCourier) {
      if (!tracking_number?.trim()) {
        return jsonResponse({ error: "Tracking number is required for courier deliveries" }, 400);
      }
    }

    if (action === "delivered") {
      if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
        return jsonResponse({ error: "At least one evidence file is required for delivered status" }, 400);
      }
      if (isCourier && !tracking_number?.trim()) {
        return jsonResponse({ error: "Tracking number is required for courier deliveries" }, 400);
      }
    }

    // Validate file ownership if file_ids provided
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
        if (!file) {
          return jsonResponse({ error: `File ${fid} not found` }, 400);
        }
        if (file.uploaded_by_user_id !== userId) {
          return jsonResponse({ error: `File ${fid} does not belong to you` }, 403);
        }
        validFileIds.push(fid);
      }
    }

    const newStatus = ACTION_TO_STATUS[action];
    const now = new Date().toISOString();

    // 1. Handle intermediate transitions required by the state machine
    // The DB trigger enforces: payment_secured → seller_preparing_delivery → seller_dispatched
    // So if we're jumping from payment_secured to dispatched/delivered, we must step through
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

      // Log the intermediate step
      await admin.from("transaction_status_history").insert({
        transaction_id,
        old_status: tx.status,
        new_status: "seller_preparing_delivery",
        changed_by_user_id: userId,
        reason: "Auto-transition for delivery update",
      });
    }

    // For delivered action going through dispatched intermediate
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

    // 2. Update transaction status to final target
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (action === "delivered") {
      updatePayload.delivered_at = now;
      const deadline = new Date(Date.now() + verificationWindowHours * 60 * 60 * 1000).toISOString();
      updatePayload.verification_deadline_at = deadline;
    }

    const { error: updateErr } = await admin
      .from("transactions")
      .update(updatePayload)
      .eq("id", transaction_id);

    if (updateErr) {
      console.error("Transaction update error:", updateErr);
      return jsonResponse({ error: `Failed to update status: ${updateErr.message}` }, 500);
    }

    // 2-7: Parallel writes for history, events, tracking, delivery updates, proof files, notifications
    const parallelOps: Promise<unknown>[] = [];

    // 2. transaction_status_history
    parallelOps.push(
      admin.from("transaction_status_history").insert({
        transaction_id,
        old_status: tx.status,
        new_status: newStatus,
        changed_by_user_id: userId,
        reason: delivery_notes || `Seller updated to ${action}`,
      })
    );

    // 3. transaction_events
    parallelOps.push(
      admin.from("transaction_events").insert({
        transaction_id,
        event_type: ACTION_TO_EVENT[action],
        actor_user_id: userId,
        actor_role: "seller",
        event_data: {
          action,
          tracking_number: tracking_number || null,
          delivery_notes: delivery_notes || null,
          file_count: validFileIds.length,
        },
      })
    );

    // 4. delivery_updates
    parallelOps.push(
      admin.from("delivery_updates").insert({
        transaction_id,
        status: ACTION_TO_DELIVERY_STATUS[action],
        notes: delivery_notes || null,
        updated_by_user_id: userId,
      })
    );

    // 5. Upsert delivery_tracking_details
    if (tracking_number?.trim() || action === "dispatched" || action === "delivered") {
      const trackingPayload: Record<string, unknown> = {
        transaction_id,
        tracking_number: tracking_number?.trim() || null,
      };
      if (action === "dispatched") {
        trackingPayload.shipped_at = now;
      }
      if (action === "delivered") {
        trackingPayload.delivered_at = now;
      }

      parallelOps.push(
        admin.from("delivery_tracking_details")
          .upsert(trackingPayload, { onConflict: "transaction_id" })
      );
    }

    // 6. delivery_proof_files for each validated file
    if (validFileIds.length > 0) {
      // Get file details to determine proof_type
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

      parallelOps.push(
        admin.from("delivery_proof_files").insert(proofInserts)
      );

      // Mark files as non-temporary
      parallelOps.push(
        admin.from("files")
          .update({ is_temporary: false, context_type: "delivery_proof", retention_category: "delivery_proof" })
          .in("id", validFileIds)
      );
    }

    // 7. delivery_confirmations for delivered
    if (action === "delivered") {
      parallelOps.push(
        admin.from("delivery_confirmations")
          .upsert({
            transaction_id,
            seller_marked_delivered_at: now,
          }, { onConflict: "transaction_id" })
      );
    }

    // 8. Create buyer notification
    if (tx.buyer_id && (action === "dispatched" || action === "delivered")) {
      const notifTitle = action === "dispatched"
        ? "Your item has been dispatched"
        : "Your item has been marked as delivered";
      const notifMessage = action === "dispatched"
        ? "The seller has shipped your item. You will be notified when it arrives."
        : `Your item has been marked as delivered. Please verify within ${verificationWindowHours} hours.`;

      parallelOps.push(
        admin.from("notifications").insert({
          user_id: tx.buyer_id,
          type: "delivery_update",
          channel: "in_app",
          title: notifTitle,
          message: notifMessage,
          related_transaction_id: transaction_id,
          status: "pending",
        })
      );
    }

    // Execute all parallel operations
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
        ? new Date(Date.now() + verificationWindowHours * 60 * 60 * 1000).toISOString()
        : null,
    });
  } catch (err) {
    console.error("update-delivery-status error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
