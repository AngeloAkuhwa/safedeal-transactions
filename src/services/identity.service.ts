import { supabase } from "@/integrations/supabase/client";

export type IdentitySubmissionStatus = "not_started" | "pending_review" | "verified" | "rejected" | "more_info_needed";
export type IdentityVerificationMethod = "nin" | "government_id" | "metamap";

export interface IdentitySubmission {
  id: string;
  status: IdentitySubmissionStatus;
  verification_method: IdentityVerificationMethod;
  legal_name: string;
  date_of_birth: string | null;
  masked_identifier: string | null;
  consent_accepted_at: string;
  submitted_at: string;
  reviewed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  provider_reference: string | null;
  created_at: string;
  updated_at: string;
  /** "manual" for the NIN and document routes, "metamap" for the automated
   *  one. Present on rows created after the MetaMap migration. */
  provider?: string | null;
  /** MetaMap's own verdict, verbatim. Separate from `status`, which is what
   *  SafeDeal concluded from it. */
  provider_status?: string | null;
  provider_document_type?: string | null;
  /** Set only when the decision was made without a human looking. */
  auto_decided_at?: string | null;
}

const IDENTITY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-identity`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("No active session. Please sign in again.");
  return token;
}

async function identityFetch(method: string, body?: unknown) {
  const token = await getAccessToken();
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(IDENTITY_URL, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed: ${res.status}`);
  return json;
}

export const getIdentityStatus = async (): Promise<{ submission: IdentitySubmission | null }> => {
  return identityFetch("GET");
};

export const submitIdentity = async (data: {
  legal_name: string;
  verification_method: IdentityVerificationMethod;
  masked_identifier?: string;
  document_file_id?: string;
  date_of_birth?: string;
  consent_accepted: boolean;
}) => {
  return identityFetch("POST", data);
};

/**
 * Open an automated check.
 *
 * Returns a MetaMap hosted URL for the browser to navigate to. Everything
 * after that happens between the person and MetaMap; the result arrives at our
 * webhook, never through this client. A client that could report its own
 * verification result would be the whole vulnerability, so this deliberately
 * returns a URL and nothing else.
 */
export const startMetaMapVerification = async (data?: {
  legal_name?: string;
}): Promise<{ url: string; submission_id: string; resumed: boolean }> => {
  const token = await getAccessToken();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/metamap-start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(data ?? {}),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json?.error === "provider_not_configured") {
      // Named rather than generic. This is a configuration state, not a user
      // error, and a vague message here would send someone re-entering their
      // name at a form that was never going to work.
      throw new Error(
        "Instant verification is not switched on yet. Use the manual route below for now.",
      );
    }
    throw new Error(json?.message || json?.error || `Could not start verification (${res.status})`);
  }
  return json;
};

export const resubmitIdentity = async (data: {
  legal_name?: string;
  masked_identifier?: string;
  document_file_id?: string;
  date_of_birth?: string;
}) => {
  return identityFetch("PATCH", data);
};
