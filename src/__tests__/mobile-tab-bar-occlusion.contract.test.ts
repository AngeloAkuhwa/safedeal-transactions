import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * MobileTabBar is a fixed bottom bar shown on every /dashboard* and /seller*
 * route. Any page in that surface that establishes its own scroll container
 * (overflow-hidden/overflow-auto/overflow-y-auto) or a fixed viewport height
 * (h-[100dvh]/h-screen) on an ungated root/main element hides content behind
 * the tab bar on mobile. Those utilities must always carry an lg:/md: prefix.
 */
const PAGES = [
  "src/pages/BuyerCart.tsx",
  "src/pages/BuyerSavedProducts.tsx",
  "src/pages/BuyerMarketplace.tsx",
  "src/pages/SellerStorefront.tsx",
];

function ungatedOverflowOrHeight(source: string): string[] {
  const offenders: string[] = [];
  const classAttrs = source.match(/className=\{?["'`][^"'`]*["'`]\}?/g) ?? [];
  for (const attr of classAttrs) {
    const tokens = attr.split(/\s+/);
    for (const raw of tokens) {
      const token = raw.replace(/["'`{}]/g, "");
      const isTarget =
        /^overflow-(hidden|auto|y-auto)$/.test(token) ||
        /^h-\[100dvh\]$/.test(token) ||
        /^h-screen$/.test(token);
      if (isTarget) offenders.push(token);
    }
    // If any prefixed (lg:/md:) variant of the same utility exists alongside
    // an unprefixed one in the same class list, only the unprefixed one is a
    // real offender — filtered below by checking the raw attribute text.
  }
  // Re-scan more precisely: split whole class strings and only flag bare
  // (non lg:/md:-prefixed) utilities.
  const bareOffenders: string[] = [];
  for (const attr of classAttrs) {
    const tokens = attr.replace(/[{}"'`]/g, "").split(/\s+/);
    for (const token of tokens) {
      const bare =
        token === "overflow-hidden" ||
        token === "overflow-auto" ||
        token === "overflow-y-auto" ||
        token === "h-[100dvh]" ||
        token === "h-screen";
      if (bare) bareOffenders.push(token);
    }
  }
  return bareOffenders;
}

describe("mobile tab bar occlusion contract", () => {
  it.each(PAGES)("%s has no ungated root/main overflow or fixed-height utility", (relPath) => {
    const full = path.join(process.cwd(), relPath);
    const source = fs.readFileSync(full, "utf-8");
    const offenders = ungatedOverflowOrHeight(source);
    expect(offenders).toEqual([]);
  });
});
