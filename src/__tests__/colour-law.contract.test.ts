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
    // .ts as well as .tsx. The original walk read .tsx only, and an audit
    // found what that missed: alertConfig.ts carried 43 raw palette
    // utilities (a complete hand-built amber accent and a sky accent) that
    // rendered on the customer-facing seller alert surfaces while every
    // colour gate reported green. A className is a className wherever the
    // string lives; the file extension was never the right scope.
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Files that live outside the admin path but whose every importer is under
 * components/admin or pages/Admin*. Verified by hand when each was added;
 * they count against the admin budget because that is the only surface that
 * renders them. Add a file here only after checking its importers the same
 * way.
 */
const ADMIN_SURFACE_TS = new Set([
  "src/services/permission-approval-rules.ts",
  "src/services/admin-access-control.service.ts",
]);

/**
 * The one admin colour DEFINITION site (plan 4.5): the module call sites
 * consume tones from by meaning. Its raw utilities are the vocabulary being
 * defined, not a screen speaking colour inline, so it is excluded from the
 * admin call-site budget the same way format.ts is allowed its Intl currency
 * literals. Excluding it is safe against gaming: any NEW raw colour on a
 * screen still lands in the budget, and this set is closed. A second entry
 * here needs the same argument this one carries.
 */
const ADMIN_COLOUR_DEFINITION_FILES = new Set([
  "src/components/admin/palette.ts",
]);

describe("the admin colour definition exemption cannot rot", () => {
  it("every exempted file exists and still defines colour", () => {
    for (const rel of ADMIN_COLOUR_DEFINITION_FILES) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full), `${rel} no longer exists; drop the exemption`).toBe(true);
      const hits = (stripComments(fs.readFileSync(full, "utf8")).match(RAW_COLOUR) ?? []).length;
      expect(hits, `${rel} defines no raw colour; drop the exemption`).toBeGreaterThan(0);
    }
  });
});

const isAdmin = (rel: string) =>
  rel.startsWith("src/components/admin/") ||
  /^src\/pages\/Admin/.test(rel) ||
  rel.startsWith("src/services/admin-") ||
  rel.startsWith("src/lib/admin-") ||
  ADMIN_SURFACE_TS.has(rel);
const isUi = (rel: string) => rel.startsWith("src/components/ui/");

/**
 * The counts on the day this landed. Lower them as areas are converted; never
 * raise them. A rise means a component was written outside the token system.
 *
 * Re-anchored once when the walk widened from .tsx to .ts as well: the same
 * code, seen through a wider lens, so the floor moved to what the wider lens
 * measures. admin absorbed the .ts helper files under components/admin plus
 * the two verified admin-surface services above. customer stayed at 12: the
 * only customer .ts offender the wider walk found (alertConfig.ts, 43 raw
 * utilities) was converted to the tone system in the same change rather than
 * budgeted for.
 */
/*
 * admin re-anchored 4278 to 4236 in the 4.5 batch-1 conversion: badges.tsx
 * shed its inline triads to the palette definition file (which is excluded
 * above as the vocabulary's one definition site, so the budget now measures
 * call sites only).
 */
const BUDGET = {
  admin: 4236,
  ui: 4,
  customer: 12,
};

/*
 * ui dropped 7 to 4 in the same change: the destructive toast close button's
 * red-* utilities became destructive tokens. The remaining four are the
 * bg-black/80 overlay scrims in dialog, alert-dialog, sheet and drawer: a
 * dimming layer is deliberately black in both themes, because its job is to
 * darken whatever is behind it, and a theme-following scrim would lighten in
 * dark mode and stop dimming.
 */
/**
 * Literal hex, anywhere in a component. Same rule: it only goes down.
 * Re-anchored with the .ts widening for exactly two hexes, each checked:
 * image-quality.ts flattens transparency onto "#ffffff" before JPEG encode
 * (JPEG has no alpha, and the paper-white flatten has no dark mode to
 * follow), and admin-consistency.ts styles a devtools console.log line.
 */
const HEX_BUDGET = 109;

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
    if (ADMIN_COLOUR_DEFINITION_FILES.has(rel)) continue;
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
