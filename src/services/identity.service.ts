import { supabase } from "@/integrations/supabase/client";

export type IdentitySubmissionStatus = "not_started" | "pending_review" | "verified" | "rejected" | "more_info_needed";
export type IdentityVerificationMethod = "nin" | "government_id";

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

export const resubmitIdentity = async (data: {
  legal_name?: string;
  masked_identifier?: string;
  document_file_id?: string;
  date_of_birth?: string;
}) => {
  return identityFetch("PATCH", data);
};
