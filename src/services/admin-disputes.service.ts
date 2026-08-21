/**
 * Admin Disputes Queue service.
 * Read-only: backed by `admin-disputes-queue` edge function.
 * Write actions (resolve, request more info) reuse
 * `admin-transaction-actions.service.ts`: never duplicated here.
 */
import { supabase } from "@/integrations/supabase/client";

export type DisputeQueueQuick =
  | "overdue" | "open" | "awaiting_seller" | "under_review" | "escalated" | "resolved" | "all";

export interface DisputeQueueParams {
  quick?: DisputeQueueQuick;
  q?: string;
  reason?: string;
  agent?: string;
  amount_bucket?: string;
  date_from?: string;
  date_to?: string;
  priority?: string;
  money_status?: string;
  evidence_status?: string;
  sla_state?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface DisputeQueueKpis {
  open_disputes: number;
  awaiting_seller: number;
  under_review: number;
  overdue: number;
  resolved_today: number;
  escalated: number;
  resolved_total: number;
  all_total: number;
  deltas: { open_vs_yesterday: number; resolved_vs_target: number };
}

export interface DisputeQueueRow {
  dispute_id: string;
  dispute_code: string;
  transaction_id: string;
  transaction_code: string;
  item_title: string;
  priority: "overdue" | "high" | "medium" | "low" | "resolved";
  reason_label: string;
  reason_raw: string;
  parties: {
    buyer: { name: string; avatar_url?: string | null };
    seller: { name: string; avatar_url?: string | null; store_name?: string | null; verified?: boolean };
  };
  amount: number;
  currency: "NGN";
  money_status: string;
  dispute_status: string;
  outcome: { type: string; refund_amount?: number | null; release_amount?: number | null } | null;
  sla: {
    due_at_iso?: string | null;
    overdue_by_minutes?: number | null;
    due_in_minutes?: number | null;
    resolved_at_iso?: string | null;
  };
  agent: { user_id: string; name: string; avatar_url?: string | null } | null;
  opened_at: string;
  resolved_at: string | null;
}

export interface DisputeQueueResponse {
  kpis: DisputeQueueKpis;
  rows: DisputeQueueRow[];
  filters: {
    reasons: string[];
    agents: { user_id: string; name: string }[];
    amount_buckets: string[];
  };
  pagination: { page: number; page_size: number; total: number };
}

export class AdminAccessRequiredError extends Error {
  constructor() { super("Admin access required"); this.name = "AdminAccessRequiredError"; }
}

function buildQuery(params: DisputeQueueParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function resolveSession() {
  let { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData?.session ?? null;
  const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
  if (!session || (expiresAt && expiresAt - Date.now() < 60_000)) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed?.session ?? session;
  }
  return session;
}

async function authedFetch(path: string): Promise<Response> {
  const session = await resolveSession();
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise<Response>(() => {});
  }
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
  const url = `https://${projectId}.supabase.co/functions/v1/admin-disputes-queue${path}`;
  return fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
  });
}

async function fetchWithRetry(path: string): Promise<Response> {
  let res: Response;
  try {
    res = await authedFetch(path);
  } catch {
    await new Promise((r) => setTimeout(r, 600));
    return await authedFetch(path);
  }
  if (res.status === 401) {
    await supabase.auth.refreshSession();
    res = await authedFetch(path);
  } else if (res.status >= 500) {
    await new Promise((r) => setTimeout(r, 600));
    res = await authedFetch(path);
  }
  return res;
}

export async function getAdminDisputesQueue(params: DisputeQueueParams = {}): Promise<DisputeQueueResponse> {
  const res = await fetchWithRetry(buildQuery(params));
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise<DisputeQueueResponse>(() => {});
  }
  if (res.status === 403) throw new AdminAccessRequiredError();
  if (!res.ok) throw new Error(`Queue load failed (${res.status})`);
  return (await res.json()) as DisputeQueueResponse;
}

export async function exportAdminDisputesQueue(params: DisputeQueueParams = {}): Promise<Blob> {
  const res = await authedFetch(buildQuery({ ...params, format: "csv" } as DisputeQueueParams & { format: string }));
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return await res.blob();
}

export {
  resolveDispute,
  disputeRequestMoreInfo,
  freezeTransaction,
  unfreezeTransaction,
  addInternalNote,
  flagForReview,
  escalateDispute,
} from "./admin-transaction-actions.service";