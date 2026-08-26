import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readConfig, hostedFlowUrl } from "../_shared/metamap.ts";
import { logEdgeError } from "../_shared/log-error.ts";

/**
 * Start an automated identity check.
 *
 * Creates (or reuses) an `identity_submissions` row, then hands back the
 * MetaMap hosted URL for the browser to open. Everything after that happens
 * between the person and MetaMap; the result comes back to `metamap-webhook`,
 * never through the client, because a client that could report its own
 * verification result would be the entire vulnerability.
 *
 * Reusing an in-flight row rather than creating one per click matters: a
 * person who taps "verify" twice, or reloads the page, would otherwise leave
 * two pending submissions and the second webhook would update the wrong one.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "not_authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !userData?.user) return json({ error: "invalid_session" }, 401);
    const userId = userData.user.id;

    // Config is read after the caller is known, so an unauthenticated prod can
    // not use this endpoint to discover whether MetaMap is configured.
    const cfg = readConfig();
    if ("missing" in cfg) {
      // Loud, and specific about which secrets. A silent fallback to the
      // manual flow here would look like MetaMap simply not being offered, and
      // nobody would find out it had never been switched on.
      console.error("metamap-start not configured, missing:", cfg.missing.join(", "));
      void logEdgeError(admin, {
        function_name: "metamap-start",
        error_code: "metamap_not_configured",
        message: `MetaMap secrets missing: ${cfg.missing.join(", ")}`,
        req,
        http_status: 503,
        severity: "fatal",
        user_id: userId,
        request_context: { missing: cfg.missing },
      });
      return json({ error: "provider_not_configured", missing: cfg.missing }, 503);
    }

    const body = (await req.json().catch(() => ({}))) as { legal_name?: unknown };

    // Same gate the manual route uses: phone and location first.
    const { data: verif } = await admin
      .from("account_verifications")
      .select("verification_level")
      .eq("user_id", userId)
      .maybeSingle();
    if ((verif?.verification_level ?? "unverified") === "unverified") {
      return json(
        {
          error: "prerequisites_incomplete",
          message: "Complete phone verification and location setup first.",
        },
        403,
      );
    }

    const { data: latest } = await admin
      .from("identity_submissions")
      .select("id, status, provider, legal_name, provider_reference")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.status === "verified") {
      return json({ error: "already_verified" }, 409);
    }

    // A pending MetaMap row is resumable: hand back a URL pointing at the same
    // submission rather than opening a second one.
    let submissionId = latest?.id ?? null;
    const resumable = latest && latest.status === "pending_review" && latest.provider === "metamap";

    if (!resumable) {
      // A manual submission still pending is left alone, not overwritten: it
      // may be sitting in the admin queue with a reviewer already on it.
      const legalName =
        typeof body.legal_name === "string" && body.legal_name.trim()
          ? body.legal_name.trim().slice(0, 200)
          : (latest?.legal_name ?? userData.user.user_metadata?.full_name ?? "").trim();

      if (!legalName) {
        return json({ error: "legal_name_required" }, 400);
      }

      const { data: created, error: insertError } = await admin
        .from("identity_submissions")
        .insert({
          user_id: userId,
          status: "pending_review",
          verification_method: "metamap",
          provider: "metamap",
          legal_name: legalName.slice(0, 200),
          // The person accepts the provider's own consent inside the hosted
          // flow, but our record of consent is ours to keep.
          consent_accepted_at: new Date().toISOString(),
          consent_text_version: "metamap-v1",
          previous_submission_id: latest?.id ?? null,
        })
        .select("id")
        .single();

      if (insertError || !created) {
        console.error("metamap-start insert failed:", insertError?.message);
        void logEdgeError(admin, {
          function_name: "metamap-start",
          error_code: "submission_insert_failed",
          message: insertError?.message ?? "insert returned no row",
          req,
          http_status: 500,
          user_id: userId,
        });
        return json({ error: "could_not_start" }, 500);
      }
      submissionId = created.id;
    }

    const url = hostedFlowUrl(cfg.config, {
      submission_id: submissionId!,
      user_id: userId,
    });

    return json({ url, submission_id: submissionId, resumed: Boolean(resumable) });
  } catch (err) {
    console.error("metamap-start error:", err);
    void logEdgeError(null, {
      function_name: "metamap-start",
      message: err,
      req,
      http_status: 500,
      severity: "error",
    });
    return json({ error: "internal_error" }, 500);
  }
});
