/**
 * The back office focuses one way.
 *
 * Measured before the fix: 35 focus declarations across 14 admin files in
 * SEVEN different hues, and the hue tracked the SCREEN rather than the state.
 *
 *   flagged users     focus:border-red-500
 *   escrow, payouts   focus:border-emerald-500
 *   disputes          focus:border-orange-500
 *   everything else   blue, at four different opacities
 *
 * So a plain search box on the flagged-users page announced itself in the
 * colour this product reserves for something being wrong, and the same box on
 * the payouts page announced itself in the colour reserved for something
 * having completed. Neither is what "the cursor is here" means. The colour law
 * says it directly: destructive for real problems, success for a genuinely
 * completed state, and colour must never be the only thing carrying meaning.
 *
 * Nothing outside admin had the problem, because every customer surface
 * focuses through the shadcn primitives and inherits `ring-ring` once. This
 * file exists to keep admin in the same condition now that it is.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const PALETTE = path.join(ROOT, "src/components/admin/palette.ts");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const rel = (f: string) => path.relative(ROOT, f);
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const ADMIN_FILES = [
  ...walk(path.join(ROOT, "src/components/admin")),
  ...walk(path.join(ROOT, "src/pages")).filter((f) => /\/Admin[A-Z]/.test(f)),
].filter((f) => f !== PALETTE);

/** A focus that paints itself a saturated hue. Slate is not in the list: a
 *  neutral focus border is a different (and unused) idea, not a state claim. */
const TONED_FOCUS =
  /focus(-visible)?:(border|ring)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(\/\d{1,3})?/g;

/**
 * The one exemption, named rather than pattern-matched.
 *
 * `AdminDisputeDetail` tints its message composer by which conversation you
 * are in: buyer blue, seller orange, internal purple, applied as a triad
 * across the tab border, the focus border and the send button. That hue is a
 * CATEGORY (which thread am I writing in) rather than a STATE, the three
 * members move together, and flattening the focus alone would leave a blue
 * focus inside an orange-bordered box. Consistent with how D11 treated
 * `PayoutStatusPill`: a coherent local family is not drift.
 *
 * Scoped to the one declaration site so a fourth colour cannot be added
 * elsewhere in the file under cover of this entry.
 */
const CATEGORY_TRIAD = {
  file: "src/pages/AdminDisputeDetail.tsx",
  marker: "const tabAccent",
  expected: 3,
};

describe("the back office has one focus treatment", () => {
  it("finds the admin surface to check", () => {
    expect(ADMIN_FILES.length).toBeGreaterThan(50);
  });

  it("defines it once, in the palette", () => {
    const palette = fs.readFileSync(PALETTE, "utf8");
    expect(palette).toMatch(/export const ADMIN_FOCUS\b/);
  });

  it("no admin file hand-writes a toned focus", () => {
    const offenders: string[] = [];
    for (const file of ADMIN_FILES) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const matches = [...src.matchAll(TONED_FOCUS)].map((m) => m[0]);
      if (!matches.length) continue;
      if (rel(file) === CATEGORY_TRIAD.file && src.includes(CATEGORY_TRIAD.marker)) {
        // The exemption is bounded: exactly the triad, no more.
        expect(
          matches.length,
          `${CATEGORY_TRIAD.file} carries ${matches.length} toned focus classes, ` +
            `expected exactly ${CATEGORY_TRIAD.expected} (the buyer/seller/internal triad). ` +
            "A new one is not covered by that exemption.",
        ).toBe(CATEGORY_TRIAD.expected);
        continue;
      }
      offenders.push(`${rel(file)}: ${matches.join(", ")}`);
    }
    expect(
      offenders,
      "a focus colour must not encode which screen you are on:\n  " +
        offenders.join("\n  ") +
        "\nUse ADMIN_FOCUS from @/components/admin/palette.",
    ).toEqual([]);
  });

  it("the treatment is consumed, not just defined", () => {
    // A palette entry nobody imports is the same as no palette entry, and the
    // failure is silent: the sites keep their own colours and the guard above
    // is the only thing that would ever notice.
    const consumers = ADMIN_FILES.filter((f) =>
      /\bADMIN_FOCUS\b/.test(fs.readFileSync(f, "utf8")),
    );
    expect(consumers.length).toBeGreaterThanOrEqual(13);
  });

  it("never says focus in red or green, which mean something else here", () => {
    const palette = fs.readFileSync(PALETTE, "utf8");
    const value = palette.match(/export const ADMIN_FOCUS\s*=\s*\n?\s*"([^"]*)"/)?.[1] ?? "";
    expect(value, "ADMIN_FOCUS is not a readable string literal").not.toBe("");
    expect(value).not.toMatch(/red|emerald|green|orange|amber/);
  });

  it("leaves the customer surface alone, where the primitives already do this", () => {
    const customer = [
      ...walk(path.join(ROOT, "src/components")).filter((f) => !/\/admin\//.test(f)),
      ...walk(path.join(ROOT, "src/pages")).filter((f) => !/\/Admin[A-Z]/.test(f)),
    ];
    const offenders = customer
      .filter((f) => !/\/components\/ui\//.test(f))
      .filter((f) => TONED_FOCUS.test(stripComments(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(
      offenders,
      "a customer surface hand-rolled a focus colour instead of inheriting ring-ring",
    ).toEqual([]);
  });
});
