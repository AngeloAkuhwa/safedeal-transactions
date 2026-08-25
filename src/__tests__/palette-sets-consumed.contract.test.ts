/**
 * A complete palette set does not get written out by hand.
 *
 * The per-tone convergence batches (6.2) each took one hue, so the tones
 * nobody had a reason to open kept restating the palette verbatim. Measured
 * after batch 9 there were still **131** complete sets written as literal
 * class strings: 37 success, 23 danger, 22 warning, 19 info, 17 special,
 * 5 neutral, 2 elevated, and 6 ADMIN_CATEGORY.cyan.
 *
 * The cyan six are the interesting ones. No batch had ever touched the
 * category map, because every pass was scoped by TONE and a category is not
 * a tone, so a whole shelf of the palette sat unconsumed while the tones
 * around it were swept twice. That is the same shape as rule 7: a second
 * copy only has to be forgotten once, and this one was forgotten by the
 * scoping rather than by a person.
 *
 * "Complete" is the entire rule and it is deliberately strict. A string has
 * to carry EVERY member of a set before this complains, because a partial
 * set is bespoke work rather than a restated definition, and sweeping those
 * would be a visual change wearing a mechanical pass's clothes. That
 * distinction is what let batch 9's conversion be proved rather than
 * reviewed: each rewritten string was re-expanded and its token multiset
 * compared with the original, so pixel identity was a property of the
 * transform and not a claim about it.
 *
 * Interpolated templates were skipped by the conversion out of caution
 * (splitting one on whitespace tears an inner ternary apart). Measured
 * afterwards, that caution cost nothing: zero of the 131 lived in one.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_TONE, ADMIN_CATEGORY } from "@/components/admin/palette";

const ROOT = path.resolve(__dirname, "../..");
const AREAS = [
  path.join(ROOT, "src/components/admin"),
  path.join(ROOT, "src/pages"),
];

/** The palette file is the definition site; it is allowed to say them. */
const DEFINITION = path.join(ROOT, "src/components/admin/palette.ts");

function adminSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string, pagesOnly: boolean) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!pagesOnly) walk(full, false);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(entry.name)) continue;
      if (full === DEFINITION) continue;
      if (pagesOnly && !entry.name.startsWith("Admin")) continue;
      out.push(full);
    }
  };
  walk(AREAS[0], false);
  walk(AREAS[1], true);
  return out;
}

/** Every named set in the palette, as its member class tokens. */
function paletteSets(): Array<{ name: string; members: string[] }> {
  const sets: Array<{ name: string; members: string[] }> = [];
  for (const [tone, classes] of Object.entries(ADMIN_TONE)) {
    for (const kind of ["badge", "panel", "chip"] as const) {
      sets.push({ name: `ADMIN_TONE.${tone}.${kind}`, members: classes[kind].split(" ") });
    }
  }
  for (const [hue, value] of Object.entries(ADMIN_CATEGORY)) {
    sets.push({ name: `ADMIN_CATEGORY.${hue}`, members: value.split(" ") });
  }
  return sets;
}

// Class strings only: a double-quoted or backtick literal with no newline.
const STRING = /"([^"\n]{4,400})"|`([^`\n]{4,400})`/g;

describe("admin never restates a complete palette set", () => {
  const sets = paletteSets();

  it("has sets to look for", () => {
    // Zero here would mean the palette shape changed under the guard, not
    // that the surface got clean.
    expect(sets.length).toBeGreaterThan(15);
  });

  it("finds no set written out as literal classes", () => {
    const offenders: string[] = [];
    for (const file of adminSources()) {
      const rel = path.relative(ROOT, file);
      fs.readFileSync(file, "utf8").split("\n").forEach((line, idx) => {
        for (const m of line.matchAll(STRING)) {
          const tokens = new Set((m[1] ?? m[2]).split(/\s+/));
          for (const set of sets) {
            if (set.members.every((t) => tokens.has(t))) {
              offenders.push(`${rel}:${idx + 1}  restates ${set.name}`);
            }
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
