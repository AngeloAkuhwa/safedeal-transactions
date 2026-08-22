import { describe, it, expect, beforeAll } from "vitest";
import {
  ADMIN_FUNCTIONS,
  hasTestCreds,
  rawInvoke,
  signInAsBuyer,
} from "./helpers/adminAuth";

/**
 * Item #16: contract tests that lock in server-side role enforcement for
 * every admin edge function. Runs against the live backend and requires:
 *   VITE_TEST_ADMIN_EMAIL / VITE_TEST_ADMIN_PASSWORD
 *   VITE_TEST_BUYER_EMAIL / VITE_TEST_BUYER_PASSWORD
 *
 * Skipped automatically when those env vars are absent so the default
 * `vitest` run stays offline. Invoke explicitly with `npm run test:admin-auth`.
 */
const d = hasTestCreds ? describe : describe.skip;

/**
 * Every assertion here is a real HTTP round trip to a deployed edge function,
 * and there are over a hundred of them. Vitest's default per-test timeout is
 * five seconds, which is generous for a unit test and tight for a cold start
 * on a remote function that has not been called in a while.
 *
 * It bit twice in a row on one PR, on two different assertions, both timing
 * out at exactly 5000ms while the rest of the suite passed and main was green.
 * The diff on that PR was a viewport hook and a dialog component: nothing that
 * could slow a remote endpoint down. Adding one more test file to the run was
 * apparently enough to shift the parallel scheduling and tip a call that was
 * already close to the edge.
 *
 * Twenty seconds is not a weaker assertion. The statuses checked below are
 * unchanged, and a function that genuinely hangs still fails. What changes is
 * that a slow network stops being reported as a broken contract, which is the
 * failure mode that trains people to re-run a red build instead of reading it.
 *
 * Scoped to this describe rather than set globally: the other 1,200 tests are
 * offline and should still fail fast when they hang.
 */
const LIVE_TIMEOUT_MS = 20_000;

d("admin edge functions: role enforcement contract", { timeout: LIVE_TIMEOUT_MS }, () => {
  let buyerToken: string;

  beforeAll(async () => {
    const client = await signInAsBuyer();
    const { data } = await client.auth.getSession();
    buyerToken = data.session?.access_token ?? "";
    expect(buyerToken).toBeTruthy();
  });

  describe.each(ADMIN_FUNCTIONS)("%s", (fn) => {
    it("rejects anonymous callers (401)", async () => {
      const res = await rawInvoke(fn);
      await res.text();
      expect(res.status).toBe(401);
    });

    it("rejects authenticated non-admin callers (403)", async () => {
      const res = await rawInvoke(fn, { token: buyerToken });
      await res.text();
      expect([401, 403]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it("ignores client-supplied role hints in body/headers", async () => {
      const res = await rawInvoke(fn, {
        token: buyerToken,
        body: { role: "admin", is_admin: true, user_role: "admin" },
        extraHeaders: { "x-role": "admin", "x-user-role": "admin" },
      });
      await res.text();
      // Function must still refuse: role must come from JWT/has_role, never from client input.
      expect([401, 403]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});