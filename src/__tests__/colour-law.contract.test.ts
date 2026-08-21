/**
 * Raw colour may only ever decrease.
 *
 * `src/index.css` defines a complete HSL token set for both themes, and the
 * colour law says components route through it: `bg-background`,
 * `text-muted-foreground`, `border-border`, one accent, and success, warning
 * and destructive reserved for states that are genuinely complete or genuinely
 * wrong. A literal `bg-emerald-500` does not follow the theme, does not follow
 * a rebrand, and does not respond to dark mode unless someone remembered to
 * write the `dark:` variant too. Most did not.
 *
 * There are thousands of them, so this is a ratchet rather than a ban, in the
 * same shape as the lint baseline this repo already runs: parity is the gate,
 * and the number only goes down. A ban would have to be either dishonest or
 * red on the day it landed.
 *
 * Where they are matters more than the total, so the budget is per area:
 *
 *   admin      the back office. 94% of the problem, and the surface no buyer
 *              or seller ever sees, which is why it is not the first thing to
 *              fix despite being the biggest.
 *   customer   everything else: landing, marketplace, checkout, buyer and
 *              seller. Landing itself is already at zero, and the weight sits
 *              in the seller surfaces (SellerAnalytics 67, SellerUpdateDelivery
 *              62, TransactionSuccess 51). This is the budget that should reach
 *              zero first, because these are the screens customers see.
 *   ui         the shadcn primitives.
 *
 * Splitting it this way stops a hundred admin fixes from paying for one new
 * raw colour on a checkout screen.
 *
 * Comments are stripped before counting. A file that explains which raw colour
 * it replaced would otherwise be charged for the explanation, and that is a
 * good way to teach people not to write the explanation.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const PALETTES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_COLOUR = new RegExp(
  `\\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:${PALETTES})-[0-9]{2,3}\\b` +
    `|\\b(?:bg|text|border)-(?:white|black)\\b`,
  "g",
);

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const isAdmin = (rel: string) =>
  rel.startsWith("src/components/admin/") || /^src\/pages\/Admin/.test(rel);
const isUi = (rel: string) => rel.startsWith("src/components/ui/");

/**
 * The counts on the day this landed. Lower them as areas are converted; never
 * raise them. A rise means a component was written outside the token system.
 */
const BUDGET = {
  admin: 4053,
  ui: 7,
  customer: 564,
};

describe("the colour law ratchets", () => {
  const files = walk(path.join(ROOT, "src"));

  it("finds the components to count", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  const counts = { admin: 0, ui: 0, customer: 0 };
  const worst: Record<string, number> = {};

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (rel.includes("__tests__")) continue;
    const hits = (stripComments(fs.readFileSync(file, "utf8")).match(RAW_COLOUR) ?? []).length;
    if (!hits) continue;
    const area = isAdmin(rel) ? "admin" : isUi(rel) ? "ui" : "customer";
    counts[area] += hits;
    worst[rel] = hits;
  }

  for (const area of ["customer", "ui", "admin"] as const) {
    it(`${area}: no more than ${BUDGET[area]} raw colour utilities`, () => {
      const top = Object.entries(worst)
        .filter(([rel]) =>
          area === "admin" ? isAdmin(rel) : area === "ui" ? isUi(rel) : !isAdmin(rel) && !isUi(rel),
        )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([rel, n]) => `${n}  ${rel}`);

      expect(
        counts[area],
        `${area} raw colour count is ${counts[area]}, budget ${BUDGET[area]}.\n` +
          (counts[area] > BUDGET[area]
            ? "Something was written outside the token system. Use the semantic " +
              "tokens: primary for the accent, success only for a completed state, " +
              "warning and destructive only for real problems, muted and " +
              "foreground for everything else.\n"
            : "This is below budget, which is the point. Lower the number in " +
              "BUDGET to lock the gain in.\n") +
          `heaviest files in this area:\n  ${top.join("\n  ")}`,
      ).toBeLessThanOrEqual(BUDGET[area]);
    });
  }
});
