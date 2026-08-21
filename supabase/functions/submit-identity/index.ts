import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

    // ── GET: Return latest submission status ──
    if (req.method === "GET") {
      const { data: submission } = await adminClient
        .from("identity_submissions")
        .select("id, status, verification_method, legal_name, date_of_birth, masked_identifier, consent_accepted_at, submitted_at, reviewed_at, rejected_at, rejection_reason, provider_reference, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return jsonResponse({ submission: submission ?? null });
    }

    // ── POST: Submit new identity ──
    if (req.method === "POST") {
      // Check buyer is at least basic_verified
      const { data: verif } = await adminClient
        .from("account_verifications")
        .select("verification_level")
        .eq("user_id", userId)
        .single();

      const level = verif?.verification_level || "unverified";
      if (level === "unverified") {
        return jsonResponse({
          error: "Complete phone verification and location setup before submitting identity verification.",
        }, 403);
      }

      // Check no pending submission exists
      const { data: existing } = await adminClient
        .from("identity_submissions")
        .select("id, status")
        .eq("user_id", userId)
        .in("status", ["pending_review"])
        .maybeSingle();

      if (existing) {
        return jsonResponse({ error: "You already have a pending identity submission." }, 409);
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      // Validate required fields
      const legalName = body.legal_name;
      if (typeof legalName !== "string" || legalName.trim().length === 0 || legalName.length > 200) {
        return jsonResponse({ error: "legal_name must be a non-empty string (max 200 chars)" }, 400);
      }

      const method = body.verification_method;
      if (method !== "nin" && method !== "government_id") {
        return jsonResponse({ error: "verification_method must be 'nin' or 'government_id'" }, 400);
      }

      // NIN route: require masked_identifier
      if (method === "nin") {
        const masked = body.masked_identifier;
        if (typeof masked !== "string" || masked.trim().length === 0) {
          return jsonResponse({ error: "masked_identifier is required for NIN verification" }, 400);
        }
        // Must look like ****XXXX (last 4 digits)
        if (!/^\*{4,}\d{4}$/.test(masked.trim())) {
          return jsonResponse({ error: "masked_identifier must be in format ****1234 (only last 4 digits)" }, 400);
        }
      }

      // Gov ID route: require document_file_id
      if (method === "government_id") {
        const fileId = body.document_file_id;
        if (typeof fileId !== "string" || fileId.trim().length === 0) {
          return jsonResponse({ error: "document_file_id is required for government ID verification" }, 400);
        }
        // Verify the file exists and belongs to user
        const { data: file } = await adminClient
          .from("files")
          .select("id")
          .eq("id", fileId)
          .eq("uploaded_by_user_id", userId)
          .maybeSingle();

        if (!file) {
          return jsonResponse({ error: "Invalid document file" }, 400);
        }
      }

      if (!body.consent_accepted) {
        return jsonResponse({ error: "You must accept the consent acknowledgment" }, 400);
      }

      const dateOfBirth = body.date_of_birth && typeof body.date_of_birth === "string" ? body.date_of_birth : null;

      const insertData: Record<string, unknown> = {
        user_id: userId,
        status: "pending_review",
        verification_method: method,
        legal_name: (legalName as string).trim(),
        date_of_birth: dateOfBirth,
        masked_identifier: method === "nin" ? (body.masked_identifier as string).trim() : null,
        document_file_id: method === "government_id" ? (body.document_file_id as string).trim() : null,
        consent_accepted_at: new Date().toISOString(),
        consent_text_version: "v1.0",
      };

      const { data: submission, error: insertError } = await adminClient
        .from("identity_submissions")
        .insert(insertData)
        .select("id, status, verification_method, legal_name, submitted_at")
        .single();

      if (insertError) {
        console.error("Insert identity_submissions error:", insertError);
        return jsonResponse({ error: insertError.message }, 400);
      }

      return jsonResponse({ success: true, submission }, 201);
    }

    // ── PATCH: Resubmit: creates a new row, preserving history ──
    if (req.method === "PATCH") {
      const { data: latest } = await adminClient
        .from("identity_submissions")
        .select("id, status, verification_method, legal_name, date_of_birth, masked_identifier, document_file_id, consent_accepted_at, consent_text_version")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latest) {
        return jsonResponse({ error: "No submission found" }, 404);
      }

      if (latest.status !== "rejected" && latest.status !== "more_info_needed") {
        return jsonResponse({ error: "Submission can only be resubmitted when rejected or more info needed" }, 400);
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      // Build new row, carrying forward unchanged fields from the old submission
      const newRow: Record<string, unknown> = {
        user_id: userId,
        status: "pending_review",
        verification_method: latest.verification_method,
        legal_name: typeof body.legal_name === "string" && body.legal_name.trim().length > 0
          ? body.legal_name.trim()
          : latest.legal_name,
        date_of_birth: typeof body.date_of_birth === "string" ? body.date_of_birth : latest.date_of_birth,
        masked_identifier: typeof body.masked_identifier === "string"
          ? body.masked_identifier.trim()
          : latest.masked_identifier,
        document_file_id: typeof body.document_file_id === "string"
          ? body.document_file_id.trim()
          : latest.document_file_id,
        consent_accepted_at: latest.consent_accepted_at,
        consent_text_version: latest.consent_text_version || "v1.0",
        previous_submission_id: latest.id,
        submitted_at: new Date().toISOString(),
      };

      const { data: newSubmission, error: insertError } = await adminClient
        .from("identity_submissions")
        .insert(newRow)
        .select("id, status, submitted_at")
        .single();

      if (insertError) {
        return jsonResponse({ error: insertError.message }, 400);
      }

      return jsonResponse({ success: true, submission: newSubmission });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("submit-identity error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
