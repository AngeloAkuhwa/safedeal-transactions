/**
 * The share-token checkout is readable without an account.
 *
 * `/t/:shareToken` and `/t/:shareToken/pay` are the two screens a buyer sees
 * after a seller sends them a link. Both are declared public in `App.tsx`,
 * outside `ProtectedRoute`. The payment page then redirected to `/auth` from a
 * mount effect anyway, so the route was public and the page was not.
 *
 * The cost was specific. `/t/:shareToken/pay` is a URL a seller can paste into
 * a chat, a buyer can bookmark, and the browser returns to on a refresh or a
 * back button. Every one of those arrivals landed on a sign-up form without
 * ever having been shown the item, the price, the seller or the terms. There
 * is nothing to protect there: `resolve-share-token` resolves purely from the
 * token and never reads the caller's identity, so anyone holding the link can
 * already see everything the page renders.
 *
 * Seeing is public. Paying is not. Identity is required at the point money
 * moves, by `useCheckoutIdentity().requireIdentity()`.
 *
 * This test reads the source rather than rendering, deliberately. The
 * behaviour it protects is "no navigation to /auth happens as a side effect of
 * arriving", and a render test can only prove that for the paths it thought to
 * exercise. The redirect that shipped lived in a mount effect that a test
 * would have had to know to look for.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const PAY = "src/pages/BuyerPaymentSummary.tsx";
const REVIEW = "src/pages/BuyerTransactionReview.tsx";
const HOOK = "src/hooks/useCheckoutIdentity.ts";

/** Strip comments so the prose above does not satisfy or trip any check. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the share-token checkout is readable without an account", () => {
  it("keeps both screens outside ProtectedRoute", () => {
    const app = code(read("src/App.tsx"));
    for (const route of ["/t/:shareToken", "/t/:shareToken/pay"]) {
      const line = app.split("\n").find((l) => l.includes(`path="${route}"`));
      expect(line, `no route declared for ${route}`).toBeTruthy();
      expect(line, `${route} must not be wrapped in ProtectedRoute`).not.toMatch(/ProtectedRoute/);
    }
  });

  for (const file of [PAY, REVIEW]) {
    it(`${file} does not send an arriving visitor to /auth or /role-selection`, () => {
      const src = code(read(file));

      // A navigate to the sign-in or role screens is only legitimate from a
      // handler the buyer triggered. Any of them inside a useEffect is a
      // redirect that fires on arrival.
      const effects = [...src.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{/g)];
      for (const m of effects) {
        const start = m.index ?? 0;
        // Walk to the matching close brace so nested blocks are included.
        let depth = 0;
        let end = start;
        for (let i = start + m[0].length - 1; i < src.length; i++) {
          if (src[i] === "{") depth++;
          else if (src[i] === "}") {
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
        const body = src.slice(start, end);
        expect(
          /navigate\(\s*[`"'][^`"']*\/(auth|role-selection)/.test(body),
          `${file} redirects to /auth or /role-selection from a mount effect. ` +
            "A buyer who followed a share link then never sees what they are " +
            "paying for. Ask for identity from the pay handler instead, via " +
            "useCheckoutIdentity().requireIdentity().",
        ).toBe(false);
      }
    });
  }

  it("does not hide the payment page from a visitor without an account", () => {
    const src = code(read(PAY));
    // The early return that renders a skeleton must wait only on the session
    // read, never on the answer being "no account".
    expect(
      /if\s*\(\s*authState\s*===\s*"loading"\s*\|\|[^)]*"anonymous"/.test(src),
      "BuyerPaymentSummary returns a skeleton for anonymous visitors, which " +
        "is the redirect wearing a different hat: the buyer still never sees " +
        "the item, the price or the terms.",
    ).toBe(false);
  });

  it("still requires identity at the point money moves", () => {
    const src = code(read(PAY));
    expect(src, "the pay handler must call requireIdentity()").toMatch(/requireIdentity\(\)/);
    const handler = src.slice(src.indexOf("const handlePay"));
    const body = handler.slice(0, handler.indexOf("}, ["));
    expect(
      body,
      "requireIdentity() must be called before openPaystackPayment(), or an " +
        "anonymous buyer reaches Paystack with no account attached.",
    ).toMatch(/requireIdentity\(\)[\s\S]*openPaystackPayment\(\)/);
  });

  it("keeps one copy of the decision", () => {
    expect(fs.existsSync(path.join(ROOT, HOOK)), "the shared hook must exist").toBe(true);
    for (const file of [PAY, REVIEW]) {
      expect(code(read(file)), `${file} must use the shared hook`).toMatch(/useCheckoutIdentity\(/);
      expect(
        code(read(file)),
        `${file} still declares its own auth state. Two copies of this ` +
          "decision is how the two screens came to disagree about whether an " +
          "anonymous buyer may look.",
      ).not.toMatch(/setAuthState\(/);
    }
  });
});
