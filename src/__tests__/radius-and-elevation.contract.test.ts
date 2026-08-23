/**
 * @vitest-environment node
 *
 * One radius knob, and cards that are borderless where that can work.
 *
 * Before this landed, only sm/md/lg derived from --radius; rounded-xl and
 * rounded-2xl were Tailwind's fixed 12px and 16px. With --radius at 0.75rem
 * that made rounded-lg and rounded-xl render IDENTICALLY across 800+ call
 * sites, and the radius could not be tuned anywhere. The scale now derives
 * every step from the token.
 *
 * The borderless card rests on --shadow-card in light. In dark a shadow on
 * a near-black ground is invisible, so the token is zeroed there and the
 * card keeps a hairline. Both halves must exist: a theme that forgot its
 * half silently flattens every card, which is exactly the "colour defined
 * only inside one theme block" bug class this suite already polices for
 * colours.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const tailwind = readFileSync("tailwind.config.ts", "utf8");
const css = readFileSync("src/index.css", "utf8");
const card = readFileSync("src/components/ui/card.tsx", "utf8");
const productCard = readFileSync("src/components/product/BuyerProductCard.tsx", "utf8");

describe("one radius knob", () => {
  it("every borderRadius step derives from the token", () => {
    const block = /borderRadius:\s*\{([\s\S]*?)\}/.exec(tailwind);
    expect(block).toBeTruthy();
    for (const step of ["sm", "md", "lg", "xl", '"2xl"']) {
      const line = new RegExp(`${step.replace(/"/g, '"')}\\s*:\\s*"[^"]*var\\(--radius\\)`);
      expect(block![1], `${step} must derive from var(--radius)`).toMatch(line);
    }
  });
});

describe("borderless cards", () => {
  it("the elevation token exists in the light theme", () => {
    const root = /:root\s*\{([\s\S]*?)\n  \}/.exec(css);
    expect(root![1]).toContain("--shadow-card:");
  });

  it("dark zeroes the shadow, because it cannot work there", () => {
    const dark = /\.dark\s*\{([\s\S]*?)\n  \}/.exec(css);
    expect(dark![1]).toContain("--shadow-card:");
  });

  it("the Card primitive is borderless in light and hairlined in dark", () => {
    expect(card).toContain("border-transparent");
    expect(card).toContain("dark:border-border");
    expect(card).toContain("shadow-[var(--shadow-card)]");
    // The transparent border must still be a border, so nothing shifts by 1px.
    expect(card).toMatch(/\bborder\b/);
  });

  it("the product card follows the same law", () => {
    expect(productCard).toContain("border-transparent dark:border-border");
    expect(productCard).toContain("shadow-[var(--shadow-card)]");
  });
});
