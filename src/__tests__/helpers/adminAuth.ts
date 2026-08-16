import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

/**
 * Read from Vite's env, then fall back to the process environment.
 *
 * Vite does merge `VITE_`-prefixed shell variables into `import.meta.env`, so
 * the fallback is not what makes CI work — it is here because these helpers
 * also run outside a Vite transform (the provisioning script, ad-hoc node), and
 * because reading the secret from the place CI actually put it removes a whole
 * class of question when something is empty.
 *
 * What is NOT safe is writing these values into a `.env` file: Vite runs
 * dotenv-expand over it, so a password containing `$` is silently rewritten
 * before anything uses it — `$Kumaor627$$###` survives as `$$###` quoted and
 * `$$` unquoted, and sign-in then fails with a credential nobody typed wrong.
 * Secrets reach this process as environment variables and stay there.
 */
const env = (key: string): string | undefined =>
  (import.meta.env?.[key] as string | undefined) ??
  (typeof process !== "undefined" ? process.env?.[key] : undefined);

const url = env("VITE_SUPABASE_URL") as string;
const anon = env("VITE_SUPABASE_PUBLISHABLE_KEY") as string;

export const hasTestCreds = Boolean(
  env("VITE_TEST_ADMIN_EMAIL") &&
    env("VITE_TEST_ADMIN_PASSWORD") &&
    env("VITE_TEST_BUYER_EMAIL") &&
    env("VITE_TEST_BUYER_PASSWORD"),
);

function makeClient(): SupabaseClient {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInAsBuyer(): Promise<SupabaseClient> {
  const client = makeClient();
  const { error } = await client.auth.signInWithPassword({
    email: env("VITE_TEST_BUYER_EMAIL") as string,
    password: env("VITE_TEST_BUYER_PASSWORD") as string,
  });
  if (error) throw new Error(`buyer sign-in failed: ${error.message}`);
  return client;
}

export async function signInAsAdmin(): Promise<SupabaseClient> {
  const client = makeClient();
  const { error } = await client.auth.signInWithPassword({
    email: env("VITE_TEST_ADMIN_EMAIL") as string,
    password: env("VITE_TEST_ADMIN_PASSWORD") as string,
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

/**
 * The HTTP method a function actually accepts, read from its own source.
 *
 * `rawInvoke` used to POST to everything. Fifteen of these functions are
 * GET-only and one is PATCH-only, so they answered `405 method_not_allowed`
 * from the first line of the handler — before any auth ran. The test asserted
 * "not 200" and passed, while proving nothing at all about who is allowed in.
 * A guard test that a missing guard would still satisfy is worse than no test,
 * because it is counted.
 *
 * Reading the method out of the handler rather than hard-coding a table means
 * the probe follows the function: change `req.method !== "GET"` to `"POST"` and
 * the contract test retargets itself on the next run instead of quietly going
 * hollow again.
 */
const METHOD_CACHE = new Map<string, string>();

export function methodFor(fn: string): string {
  const cached = METHOD_CACHE.get(fn);
  if (cached) return cached;
  let method = "POST";
  try {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "supabase/functions", fn, "index.ts"),
      "utf8",
    );
    // `if (req.method !== "GET") return ... 405` — the guard names the one
    // method the handler serves. No guard means it serves anything; POST is
    // then the strongest probe because it can carry the role-hint body.
    const m = src.match(/req\.method\s*!==\s*["'“”]?([A-Z]+)/);
    if (m) method = m[1];
  } catch {
    /* function source not on disk — fall back to POST */
  }
  METHOD_CACHE.set(fn, method);
  return method;
}

export async function rawInvoke(
  fn: string,
  opts: { token?: string; body?: unknown; extraHeaders?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: anon,
    ...(opts.extraHeaders ?? {}),
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const method = methodFor(fn);
  const bodiless = method === "GET" || method === "HEAD";

  // A GET cannot carry a body, so the role hints move to the query string.
  // They still have to be ignored — the point of the assertion is that role
  // comes from the JWT, and a caller who can put it in a body can put it in a
  // URL just as easily.
  const target = new URL(`${url}/functions/v1/${fn}`);
  if (bodiless && opts.body && typeof opts.body === "object") {
    for (const [k, v] of Object.entries(opts.body as Record<string, unknown>)) {
      target.searchParams.set(k, String(v));
    }
  }
  if (!bodiless) headers["Content-Type"] = "application/json";

  return fetch(target.toString(), {
    method,
    headers,
    ...(bodiless ? {} : { body: JSON.stringify(opts.body ?? {}) }),
  });
}