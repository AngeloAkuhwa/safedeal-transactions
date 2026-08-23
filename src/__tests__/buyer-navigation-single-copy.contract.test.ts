/**
 * @vitest-environment node
 *
 * One buyer link list, and both presentations read it.
 *
 * The header (BuyerNav) and the sidebar (BuyerSidebar) each owned a private
 * destination array, and they drifted: the sidebar, which fronts the six
 * shopping pages, was missing Private Offers entirely, so from the
 * marketplace a buyer's own offers did not exist in the chrome. The two
 * copies also disagreed on which icon Disputes and Notifications get. This
 * is the seller navigation story from #24 replayed on the buyer side, which
 * is exactly what the working agreement's rule 7 predicts a second copy
 * will do.
 *
 * The contract mirrors seller-navigation.contract.test.ts: the canonical
 * list lives in buyer-navigation/links.ts, both presentations import it,
 * and no other file under src/ declares its own array of /dashboard/
 * destinations.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BUYER_NAV_LINKS, isBuyerLinkActive } from "@/components/buyer-navigation/links";

const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("buyer navigation single copy", () => {
  it("the canonical list carries every buyer destination", () => {
    const hrefs = BUYER_NAV_LINKS.map((l) => l.href);
    // The one the drift lost, asserted by name so its disappearance is a
    // named failure rather than a count going quietly down.
    expect(hrefs).toContain("/dashboard/offers");
    for (const required of [
      "/dashboard",
      "/dashboard/marketplace",
      "/dashboard/cart",
      "/dashboard/saved",
      "/dashboard/transactions",
      "/dashboard/disputes",
      "/dashboard/notifications",
      "/dashboard/profile",
    ]) {
      expect(hrefs).toContain(required);
    }
  });

  it("both presentations read the canonical list", () => {
    for (const file of [
      "src/components/dashboard/BuyerNav.tsx",
      "src/components/marketplace/BuyerSidebar.tsx",
    ]) {
      expect(read(file)).toContain('from "@/components/buyer-navigation/links"');
    }
  });

  it("no second buyer link list exists anywhere in src/", () => {
    // A private copy declares itself by pairing a dashboard path literal
    // with a label in an object literal outside links.ts. Navigating or
    // linking to a single destination is fine; declaring a list is not.
    const listShape = /\{[^{}]*(?:label|title)\s*:[^{}]*["'`]\/dashboard\/(?:marketplace|offers|saved|disputes)\b[^{}]*\}/;
    const offenders: string[] = [];
    for (const file of walk("src")) {
      if (file.endsWith("buyer-navigation/links.ts")) continue;
      if (listShape.test(read(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("actives exactly one entry per route", () => {
    // /dashboard must not light up on every buyer page, and a child route
    // must light its own section only.
    expect(isBuyerLinkActive("/dashboard", "/dashboard")).toBe(true);
    expect(isBuyerLinkActive("/dashboard/transactions", "/dashboard")).toBe(false);
    expect(isBuyerLinkActive("/dashboard/transactions/tx1", "/dashboard/transactions")).toBe(true);
    expect(isBuyerLinkActive("/dashboard/transactions", "/dashboard/disputes")).toBe(false);
  });
});
