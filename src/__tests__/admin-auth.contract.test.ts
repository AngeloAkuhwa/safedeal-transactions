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

d("admin edge functions: role enforcement contract", () => {
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