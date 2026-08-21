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
 *              seller. This is the budget that should reach zero first, because
 *              these are the screens customers see. The three heaviest files
 *              (SellerAnalytics 67, SellerUpdateDelivery 62, TransactionSuccess
 *              51) are now at zero via `src/lib/tone.ts`; what is left is a long
 *              tail of ten-to-twenty per file.
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

/**
 * The other half, and the half that got past the first version of this file.
 *
 * A Tailwind class is not the only way to write a colour outside the system.
 * `SellerAnalytics` drew its fee series with `stroke="#f59e0b"`, a literal amber
 * passed straight to recharts, which the class regex above structurally cannot
 * see: there is no class there to match. It sat in the middle of a chart whose
 * every other value already read from `hsl(var(--...))`, so the file scored zero
 * on the utility count while still shipping a hard-coded hue that ignored the
 * theme in exactly the way this test exists to stop.
 *
 * Print stylesheets are the legitimate exception and the reason this is a
 * ratchet rather than a ban: `TransactionReceipt` sets `#fff` and `#111` inside
 * an `@media print` block, and a sheet of paper has no dark mode to follow.
 */
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/g;

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
  customer: 384,
};

/** Literal hex, anywhere in a component. Same rule: it only goes down. */
const HEX_BUDGET = 107;

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

  it(`no more than ${HEX_BUDGET} literal hex colours`, () => {
    const perFile: string[] = [];
    let total = 0;
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel.includes("__tests__")) continue;
      const n = (stripComments(fs.readFileSync(file, "utf8")).match(RAW_HEX) ?? []).length;
      if (!n) continue;
      total += n;
      perFile.push(`${n}  ${rel}`);
    }

    expect(
      total,
      `literal hex count is ${total}, budget ${HEX_BUDGET}.\n` +
        "A hex value does not follow the theme and does not follow a rebrand. " +
        "Use hsl(var(--primary)) and friends, which work everywhere a hex does, " +
        "including inside recharts props and inline styles.\n" +
        `files:\n  ${perFile.sort((a, b) => parseInt(b) - parseInt(a)).join("\n  ")}`,
    ).toBeLessThanOrEqual(HEX_BUDGET);
  });

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
