import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

export type IdentityStatus =
  | "pending_review"
  | "verified"
  | "rejected"
  | "more_info_needed";

export interface IdentitySubmission {
  id: string;
  user_id: string;
  status: IdentityStatus;
  verification_method: string | null;
  legal_name: string | null;
  date_of_birth: string | null;
  masked_identifier: string | null;
  consent_accepted_at: string | null;
  consent_text_version: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  submitter: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  verification_level: string;
}

export interface IdentityQueue {
  submissions: IdentitySubmission[];
  total: number;
  page: number;
  per_page: number;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
    "Content-Type": "application/json",
  };
}

export async function fetchIdentityQueue(
  status: IdentityStatus = "pending_review",
  page = 1,
): Promise<IdentityQueue> {
  const res = await fetch(
    `${FN_BASE}/admin-review-identity?status=${status}&page=${page}&per_page=20`,
    { method: "GET", headers: await authHeaders() },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as IdentityQueue;
}

export async function reviewIdentitySubmission(input: {
  submission_id: string;
  decision: "approve" | "reject" | "more_info_needed";
  review_notes?: string;
  rejection_reason?: string;
}): Promise<void> {
  // Edge functions require direct fetch for PATCH (SDK invoke() cannot send it).
  const res = await fetch(`${FN_BASE}/admin-review-identity`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
}
