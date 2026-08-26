import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  readConfig,
  verifySignature,
  accessToken,
  fetchResource,
  verdictOf,
  documentTypeOf,
  rejectionReasonOf,
  auditSlice,
} from "../_shared/metamap.ts";
import { logEdgeError } from "../_shared/log-error.ts";

/**
 * Where a verification result actually becomes true.
 *
 * This endpoint decides whether a person is identity-verified on a product
 * that holds other people's money in escrow, so it is written around what an
 * attacker would try:
 *
 *   - **The body is not trusted, even when signed.** A valid signature proves
 *     MetaMap sent it, not that it says what happened. The verdict is always
 *     read from a server-to-server GET of the `resource` URL, authenticated
 *     with our own client credentials.
 *   - **The signature is checked before anything else happens**, against the
 *     raw body, in constant time. A failed check is recorded and answered 401.
 *   - **Retries cannot re-decide.** A unique index on
 *     (verification_id, event_name, event_timestamp) makes a duplicate
 *     delivery a no-op, so a replayed `verification_completed` cannot undo a
 *     rejection an admin made in between.
 *   - **Ambiguity goes to a human, never to `verified`.** An unreadable
 *     payload, a missing resource, an unrecognised status: all of them leave
 *     the submission in `pending_review`. The only path to verified is
 *     MetaMap explicitly saying `verified`.
 *   - **The submission is found through signed metadata**, and the user id in
 *     it is cross-checked against the row. A metadata `user_id` that does not
 *     match the submission's owner is refused rather than reconciled.
 *
 * It always answers 200 to a signature-valid delivery, even when processing
 * failed. MetaMap retries non-2xx, and a retry storm against a bug does not
 * fix the bug; the failure is recorded in `processing_error` and in the error
 * log instead, where someone can see it.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-signature, x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** A forged body should not get to allocate. Real deliveries are a few KB. */
const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Grant identity verification the same way the human path grants it.
 *
 * Not by writing a level directly. The level is computed by
 * `compute_verification_level`, a SECURITY DEFINER RPC that weighs phone,
 * location and identity together, and `admin-review-identity` already calls
 * it on approve. A first draft of this function set
 * `verification_level = "identity_verified"` from a constant, which is both a
 * level that does not exist (the real ones are unverified, basic_verified,
 * trusted_buyer) and a second copy of a rule that lives in one place. Rule 7,
 * caught by checking the manual path instead of assuming it.
 */
async function applyVerified(admin: SupabaseClient, userId: string) {
  await admin
    .from("account_verifications")
    .update({ identity_verified: true })
    .eq("user_id", userId);

  const { data: newLevel } = await admin.rpc("compute_verification_level", {
    _user_id: userId,
  });
  if (newLevel) {
    await admin
      .from("account_verifications")
      .update({ verification_level: newLevel })
      .eq("user_id", userId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const cfg = readConfig();
  if ("missing" in cfg) {
    console.error("metamap-webhook not configured, missing:", cfg.missing.join(", "));
    void logEdgeError(admin, {
      function_name: "metamap-webhook",
      error_code: "metamap_not_configured",
      message: `MetaMap secrets missing: ${cfg.missing.join(", ")}`,
      req,
      http_status: 503,
      severity: "fatal",
      request_context: { missing: cfg.missing },
    });
    // 503 rather than 200: this one SHOULD be retried, because the delivery is
    // genuine and the fault is entirely ours.
    return json({ error: "provider_not_configured" }, 503);
  }

  // Measured before parsing, and read as text because the signature is over
  // the bytes that arrived, not over a re-serialisation of them.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);

  const valid = await verifySignature(
    rawBody,
    req.headers.get("x-signature"),
    cfg.config.webhookSecret,
  );

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const eventName = typeof payload.eventName === "string" ? payload.eventName : "unknown";
  const resourceUrl = typeof payload.resource === "string" ? payload.resource : null;
  const verificationId = resourceUrl ? (resourceUrl.split("/").pop() ?? null) : null;
  const flowId = typeof payload.flowId === "string" ? payload.flowId : null;
  const eventTimestamp =
    typeof payload.timestamp === "string" && !Number.isNaN(Date.parse(payload.timestamp))
      ? payload.timestamp
      : null;

  const metadata = (payload.metadata ?? {}) as { submission_id?: unknown; user_id?: unknown };
  const submissionId = typeof metadata.submission_id === "string" ? metadata.submission_id : null;
  const metadataUserId = typeof metadata.user_id === "string" ? metadata.user_id : null;

  // Recorded whether or not the signature held. A forged delivery that is
  // silently dropped looks exactly like no delivery, and "somebody tried"
  // is the more important of those two facts.
  const { data: recorded, error: recordError } = await admin
    .from("metamap_webhook_events")
    .insert({
      event_name: eventName,
      verification_id: verificationId,
      flow_id: flowId,
      event_timestamp: eventTimestamp,
      signature_valid: valid,
      submission_id: submissionId,
      user_id: metadataUserId,
      raw: payload,
    })
    .select("id")
    .single();

  if (!valid) {
    console.warn("metamap-webhook rejected an unsigned or mis-signed delivery");
    void logEdgeError(admin, {
      function_name: "metamap-webhook",
      error_code: "invalid_signature",
      message: "Webhook signature did not verify",
      req,
      http_status: 401,
      severity: "fatal",
      request_context: { event_name: eventName, verification_id: verificationId },
    });
    return json({ error: "invalid_signature" }, 401);
  }

  // A unique-violation here is the idempotency key doing its job: MetaMap
  // retried a delivery we already acted on. Acknowledge and stop, because
  // re-running the decision could overturn an admin's later judgement.
  if (recordError) {
    if (recordError.code === "23505") {
      return json({ ok: true, duplicate: true });
    }
    console.error("metamap-webhook could not record delivery:", recordError.message);
    void logEdgeError(admin, {
      function_name: "metamap-webhook",
      error_code: "event_record_failed",
      message: recordError.message,
      req,
      http_status: 500,
      severity: "error",
      request_context: { event_name: eventName },
    });
    // Ours to fix, so let it retry.
    return json({ error: "record_failed" }, 503);
  }

  const finish = async (error: string | null) => {
    await admin
      .from("metamap_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: error })
      .eq("id", recorded.id);
  };

  try {
    // Only these two carry a decision. The progress events are recorded above
    // for the timeline and need nothing else.
    const decisive = eventName === "verification_completed" || eventName === "verification_updated";
    const expired = eventName === "verification_expired";

    if (!decisive && !expired) {
      await finish(null);
      return json({ ok: true, recorded: eventName });
    }

    if (!submissionId) {
      await finish("no submission_id in metadata");
      return json({ ok: true, ignored: "no_submission" });
    }

    const { data: submission } = await admin
      .from("identity_submissions")
      .select("id, user_id, status, provider")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission) {
      await finish("submission not found");
      return json({ ok: true, ignored: "unknown_submission" });
    }

    // The metadata is signed, so this should always agree. It is checked
    // anyway: if it ever disagrees, something is wrong in a way that must not
    // be resolved by picking one of the two.
    if (metadataUserId && metadataUserId !== submission.user_id) {
      await finish("metadata user_id does not match the submission owner");
      void logEdgeError(admin, {
        function_name: "metamap-webhook",
        error_code: "metadata_owner_mismatch",
        message: "Webhook metadata names a different user than the submission",
        req,
        http_status: 409,
        severity: "fatal",
        request_context: { submission_id: submissionId },
      });
      return json({ ok: true, ignored: "owner_mismatch" });
    }

    if (expired) {
      // The person opened the flow and did not finish. Not a rejection, and
      // not something to leave sitting in the admin queue forever.
      await admin
        .from("identity_submissions")
        .update({
          status: "more_info_needed",
          provider_status: "expired",
          provider_reference: verificationId,
          provider_checked_at: new Date().toISOString(),
          rejection_reason: "The verification session timed out. You can start it again.",
        })
        .eq("id", submission.id)
        .eq("status", "pending_review");
      await finish(null);
      return json({ ok: true, outcome: "expired" });
    }

    const token = await accessToken(cfg.config);
    if (!token) {
      // We cannot ask, so we do not answer. The submission stays pending and a
      // human can still decide.
      await finish("could not obtain a MetaMap access token");
      void logEdgeError(admin, {
        function_name: "metamap-webhook",
        error_code: "oauth_failed",
        message: "MetaMap OAuth did not return an access token",
        req,
        http_status: 502,
        severity: "fatal",
        request_context: { submission_id: submissionId },
      });
      return json({ ok: true, deferred: "auth" });
    }

    const resource = resourceUrl ? await fetchResource(resourceUrl, token) : null;
    const verdict = verdictOf(resource);
    const now = new Date().toISOString();

    const base: Record<string, unknown> = {
      provider_reference: verificationId,
      provider_status: (resource?.identityStatus ?? resource?.status ?? null) as string | null,
      provider_document_type: documentTypeOf(resource),
      provider_payload: auditSlice(resource),
      provider_checked_at: now,
    };

    if (verdict === "verified") {
      const { error } = await admin
        .from("identity_submissions")
        .update({
          ...base,
          status: "verified",
          reviewed_at: now,
          auto_decided_at: now,
          rejection_reason: null,
        })
        .eq("id", submission.id);
      if (error) throw error;
      await applyVerified(admin, submission.user_id);
      await finish(null);
      return json({ ok: true, outcome: "verified" });
    }

    if (verdict === "rejected") {
      const { error } = await admin
        .from("identity_submissions")
        .update({
          ...base,
          status: "rejected",
          reviewed_at: now,
          rejected_at: now,
          auto_decided_at: now,
          rejection_reason: rejectionReasonOf(resource),
        })
        .eq("id", submission.id);
      if (error) throw error;
      await finish(null);
      return json({ ok: true, outcome: "rejected" });
    }

    // `reviewNeeded`, or a shape we did not recognise. Both land here on
    // purpose: the human queue is the safe default, and the only way to
    // `verified` is MetaMap saying so in as many words.
    const { error } = await admin
      .from("identity_submissions")
      .update({ ...base, status: "pending_review" })
      .eq("id", submission.id);
    if (error) throw error;

    await finish(verdict ? null : "no recognisable verdict in the resource");
    return json({ ok: true, outcome: verdict ?? "unrecognised_deferred_to_review" });
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    await finish(message).catch(() => undefined);
    void logEdgeError(admin, {
      function_name: "metamap-webhook",
      error_code: "processing_failed",
      message,
      req,
      http_status: 500,
      severity: "fatal",
      request_context: { event_name: eventName, submission_id: submissionId },
    });
    // 200 on a signature-valid delivery we failed to process. Retrying will
    // hit the same bug, and the failure is already recorded in two places.
    return json({ ok: false, recorded: true });
  }
});
