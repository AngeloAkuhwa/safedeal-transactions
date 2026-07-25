import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const hasTestCreds = Boolean(
  import.meta.env.VITE_TEST_ADMIN_EMAIL &&
    import.meta.env.VITE_TEST_ADMIN_PASSWORD &&
    import.meta.env.VITE_TEST_BUYER_EMAIL &&
    import.meta.env.VITE_TEST_BUYER_PASSWORD,
);

function makeClient(): SupabaseClient {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInAsBuyer(): Promise<SupabaseClient> {
  const client = makeClient();
  const { error } = await client.auth.signInWithPassword({
    email: import.meta.env.VITE_TEST_BUYER_EMAIL as string,
    password: import.meta.env.VITE_TEST_BUYER_PASSWORD as string,
  });
  if (error) throw new Error(`buyer sign-in failed: ${error.message}`);
  return client;
}

export async function signInAsAdmin(): Promise<SupabaseClient> {
  const client = makeClient();
  const { error } = await client.auth.signInWithPassword({
    email: import.meta.env.VITE_TEST_ADMIN_EMAIL as string,
    password: import.meta.env.VITE_TEST_ADMIN_PASSWORD as string,
  });
  if (error) throw new Error(`admin sign-in failed: ${error.message}`);
  return client;
}

export async function anonClient(): Promise<SupabaseClient> {
  return makeClient();
}

/**
 * List of admin edge functions to probe. Keep in sync with
 * `supabase/functions/admin-*`. `admin-export-worker` is intentionally
 * excluded — it is service-role only and rejects user JWTs by design.
 */
export const ADMIN_FUNCTIONS: string[] = [
  "admin-dashboard",
  "admin-dashboard-trend",
  "admin-dispute-transition",
  "admin-disputes-queue",
  "admin-escrow-alert-settings",
  "admin-escrow-detail",
  "admin-escrow-export",
  "admin-escrow-overview",
  "admin-export-enqueue",
  "admin-export-status",
  "admin-export-transaction-data",
  "admin-flagged-user-detail",
  "admin-flagged-users",
  "admin-flagged-users-action",
  "admin-flagged-users-bulk",
  "admin-flagged-users-export",
  "admin-notifications",
  "admin-notifications-action",
  "admin-offers",
  "admin-payouts-detail",
  "admin-payouts-list",
  "admin-payouts-summary",
  "admin-reconciliation",
  "admin-reveal-user-field",
  "admin-review-identity",
  "admin-system-settings",
  "admin-transaction-actions",
  "admin-transaction-detail",
  "admin-transactions-monitor",
  "admin-user-detail",
  "admin-user-detail-export",
  "admin-users-directory",
  "admin-users-directory-export",
  "admin-vendor-status",
  "admin-log-access-action",
];

export async function rawInvoke(
  fn: string,
  opts: { token?: string; body?: unknown; extraHeaders?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: anon,
    "Content-Type": "application/json",
    ...(opts.extraHeaders ?? {}),
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  return fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}