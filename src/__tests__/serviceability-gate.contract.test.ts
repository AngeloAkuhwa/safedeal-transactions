/**
 * Serviceability is enforced where the transaction is created.
 *
 * `storefront-checkout` used to apply no region gate at all. It checked auth,
 * buyer role, stock, self-purchase, delivery method and whether an address was
 * present: and never whether SafeDeal serves the place the goods were going.
 * The only region check lived in the UI, inside the permissions object behind
 * the pay button.
 *
 * A gate that exists only in the client is not a gate. Any caller that skips
 * the UI could open a protected transaction into a region we cannot deliver to
 * or adjudicate a dispute in: and by the time that is noticed, the money is
 * already held.
 *
 * These tests lock in three things about the fix, each of which is a decision
 * rather than an implementation detail:
 *
 *   1. the check happens server-side, in the function that creates the
 *      transaction;
 *   2. it is asked about the DELIVERY ADDRESS, because where the goods go is a
 *      property of the deal, and where the buyer lives is not;
 *   3. it fails closed. An error resolving serviceability is not permission.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const CHECKOUT = path.join(ROOT, "supabase/functions/storefront-checkout/index.ts");

describe("serviceability is enforced at transaction creation", () => {
  const src = fs.readFileSync(CHECKOUT, "utf8");

  it("storefront-checkout consults serviceability", () => {
    expect(
      /is_region_serviceable/.test(src),
      "storefront-checkout must check serviceability itself. A UI-only gate is not a gate",
    ).toBe(true);
  });

  it("fails closed when serviceability cannot be resolved", () => {
    // `!serviceable` alone would let an RPC error through as `undefined`.
    expect(
      /serviceabilityError\s*\|\|\s*!serviceable/.test(src),
      "an error resolving serviceability must be treated as not serviceable",
    ).toBe(true);
  });

  it("asks about the delivery address, not the buyer's profile region", () => {
    const block = src.slice(src.indexOf("is_region_serviceable") - 1200, src.indexOf("is_region_serviceable") + 400);
    expect(
      /buyerAddress!?\.(state|city)/.test(block),
      "the question is where the goods are going, which is on the deal",
    ).toBe(true);
    expect(
      /buyerProfile\.(state_name|city_name)/.test(block),
      "the buyer's profile city must not decide whether this delivery is serviceable",
    ).toBe(false);
  });

  it("reads the region columns it depends on", () => {
    // The profile selects originally fetched only id/full_name/email/phone, so
    // every region field would have been undefined and the gate would have
    // failed closed on every transaction.
    expect(
      /\.select\("id, full_name, email, phone, country_code, state_name, city_name"\)/.test(src),
      "profile queries must select the region columns the gate reads",
    ).toBe(true);
  });

  it("rejects with a distinguishable status rather than a generic 400", () => {
    expect(/region_not_serviceable/.test(src)).toBe(true);
  });
});
