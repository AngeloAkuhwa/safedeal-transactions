import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Price must fit the card, not merely have a box that fits it.
 *
 * Measured in Chromium at a signed-in 360px viewport (a 128px card, ~98px of
 * content box): `₦1,250,000.00` is 114px of glyphs at 16px and `₦12,500,000.00`
 * is 124px. Both were cut off by the card's `overflow-hidden`, and nothing
 * showed it: `index.css` hides horizontal scrollbars app-wide.
 *
 * The trap this guards against is subtle: adding `min-w-0` makes the *element
 * box* fit while the glyphs still overflow it, so a box-based overflow check
 * reports success while the user still sees a chopped price. The fix is a fluid
 * figure that scales down instead, floored at the 12px legibility minimum this
 * repo enforces elsewhere.
 */
const CARDS = [
  "src/components/marketplace/MarketplaceProductCard.tsx",
  "src/components/storefront/ProductCard.tsx",
];

describe("product card price", () => {
  for (const file of CARDS) {
    const source = readFileSync(file, "utf8");
    const price = source
      .split("\n")
      .find((l) => /className=/.test(l) && /font-bold/.test(l) && /tabular-nums/.test(l));

    it(`${file} sizes the price fluidly`, () => {
      expect(price, "no price line found: did the markup change?").toBeTruthy();
      const clamp = /text-\[clamp\((\d*\.?\d+)rem,[^,]+,(\d*\.?\d+)rem\)\]/.exec(price!);
      expect(clamp, `price must use a fluid clamp, got: ${price}`).toBeTruthy();
      // Floor at or above the 12px legibility minimum, ceiling no larger than 1.25rem.
      expect(Number(clamp![1])).toBeGreaterThanOrEqual(0.75);
      expect(Number(clamp![2])).toBeLessThanOrEqual(1.25);
    });

    it(`${file} keeps the figure on one line`, () => {
      expect(price).toMatch(/whitespace-nowrap/);
      expect(price).toMatch(/tabular-nums/);
    });

    it(`${file} does not pin the price to a fixed step`, () => {
      expect(price, "a fixed text-base/text-lg price clips on a 128px card").not.toMatch(
        /\btext-(base|lg|xl)\b/,
      );
    });
  }
});
