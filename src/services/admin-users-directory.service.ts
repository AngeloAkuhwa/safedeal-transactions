import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

export type DirRole = "buyer" | "seller" | "business" | "admin";
export type DirStatus = "active" | "flagged" | "suspended" | "pending" | "under_investigation";
export type DirVerification = "fully" | "id" | "phone" | "email" | "none";

export interface UserDirectoryRow {
  user_id: string;
  display_id: string;
  full_name: string;
  handle: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  roles: DirRole[];
  verification: {
    level: DirVerification;
    email: boolean;
    phone: boolean;
    id: boolean;
    id_status: string | null;
  };
  transactions: { count: number; resolved: number; volume: number; currency: "NGN" };
  disputes: { total: number; active: number };
  status: DirStatus;
  trust_badge: "trusted_seller" | "flagged" | "pending" | null;
  joined_at: string | null;
  last_active_at: string | null;
  is_suspended: boolean;
  is_flagged: boolean;
  has_open_investigation: boolean;
}

export interface UserDirectorySummary {
  total_users: number;
  verified_users: number;
  verification_rate: number;
  flagged_users: number;
  new_this_week: number;
  id_verified: number;
  email_verified: number;
  new_this_month: number;
  new_per_day_avg: number;
  id_verified_pct: number;
  deltas: { total: string; verified: string; flagged: string; new_week: string; id: string; email: string };
}

export interface UserDirectoryQuery {
  q?: string;
  role?: "all" | DirRole;
  status?: "all" | DirStatus;
  verification?: "all" | DirVerification;
  range?: "all" | "7d" | "30d" | "90d";
  sort?: "recent" | "name" | "transactions" | "disputes";
  page?: number;
  page_size?: number;
}

export interface UserDirectoryResponse {
  summary: UserDirectorySummary;
  rows: UserDirectoryRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserDirectoryDetail {
  user: UserDirectoryRow;
  recent_transactions: Array<{
    transaction_id: string; transaction_code: string; amount: number;
    status: string; money_status: string; created_at: string;
    counterparty: "as_buyer" | "as_seller";
  }>;
  recent_disputes: Array<{
    dispute_id: string; transaction_id: string; status: string; reason: string; created_at: string;
  }>;
  timeline: Array<{
    id: string; type: string; note: string | null;
    admin_name: string; created_at: string;
    transaction_id?: string | null; dispute_id?: string | null;
  }>;
}

function toParams(q: UserDirectoryQuery): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    p.set(k, String(v));
  }
  return p;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
    "Content-Type": "application/json",
  };
}

export async function fetchUsersDirectory(query: UserDirectoryQuery = {}): Promise<UserDirectoryResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${FN_BASE}/admin-users-directory?${toParams(query).toString()}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as UserDirectoryResponse;
}

export async function fetchUserDirectoryDetail(userId: string): Promise<UserDirectoryDetail> {
  const headers = await authHeaders();
  const res = await fetch(`${FN_BASE}/admin-user-detail?user_id=${encodeURIComponent(userId)}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as UserDirectoryDetail;
}

export async function exportUsersDirectory(query: UserDirectoryQuery = {}): Promise<Blob> {
  const headers = await authHeaders();
  const params = toParams(query);
  params.delete("page");
  params.delete("page_size");
  const res = await fetch(`${FN_BASE}/admin-users-directory-export?${params.toString()}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return await res.blob();
}