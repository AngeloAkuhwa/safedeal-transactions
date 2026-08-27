/**
 * The colour law's own headline rule, finally checked.
 *
 * CLAUDE.md has said this since the working agreement was written: "Colour
 * must never be the only thing carrying meaning, and tinted text must still
 * reach 4.5:1." Nothing measured it. Two contract tests already police colour
 * (`colour-law` counts raw utilities down a ratchet, `palette-sets-consumed`
 * checks the maps are actually imported) and neither of them can see a
 * contrast ratio, because both work on class NAMES. A class name is not a
 * colour, and `bg-amber-600 text-white` is a perfectly well-formed class name
 * for an unreadable button.
 *
 * Which is what it turned out to be. The first run of this file, against the
 * palette as shipped, failed on three of the six `ADMIN_SOLID` buttons:
 *
 *   warning   amber-600 + white   3.19:1
 *   elevated  orange-600 + white  3.56:1
 *   success   emerald-600 + white 3.77:1
 *
 * Those are the buttons that COMMIT a judgement: release these funds, retry
 * this payout. The highest-stakes controls in the back office had the least
 * readable labels, and they only crossed 4.5:1 on HOVER, which is backwards:
 * the resting state is the one you read before deciding to click. Nobody saw
 * it because nobody could: the three failures are invisible to a reviewer who
 * is not computing relative luminance in their head, and every existing gate
 * was structurally blind to them.
 *
 * ## What this file can and cannot see
 *
 * It sees the DEFINITION site: `src/components/admin/palette.ts`, imported
 * rather than parsed, so the strings it measures are exactly the strings that
 * ship. A new tone added to any map is covered the day it is added, with no
 * list here to update.
 *
 * It does NOT see a raw colour written at a call site. That is deliberate
 * division of labour, not an oversight: `colour-law` drives raw utilities
 * toward zero and `palette-sets-consumed` makes the maps the real source, so
 * the honest way to extend contrast coverage is to keep shrinking the raw
 * count rather than to re-implement Tailwind resolution over 2,500 call sites
 * here. Recorded so the gap is known rather than assumed away.
 *
 * ## Why it fails loudly instead of skipping
 *
 * Rule 3. Every class this file cannot decompose into a real colour is a
 * failure, not a skip. The alternative is the `methodFor()` failure mode: a
 * check that silently passes what it cannot read, while counting as a pass.
 * So an unknown hue, a missing step, a text class it cannot find, all raise.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import colors from "tailwindcss/colors";
import {
  ADMIN_TONE,
  ADMIN_SOLID,
  ADMIN_BADGE_STRONG,
  ADMIN_CATEGORY,
  ADMIN_TIMELINE,
  ADMIN_GROUND,
} from "@/components/admin/palette";

/** WCAG 2.1 small-text minimum. Every string measured here is `text-xs` or
 *  `text-sm` at its call sites, so the large-text 3:1 allowance never applies. */
const AA_TEXT = 4.5;
/** WCAG 2.1 non-text contrast, for a status dot that sits beside its label. */
const AA_NON_TEXT = 3;

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: Rgb, bg: Rgb): number {
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** A translucent wash resolves against whatever is behind it. `bg-red-500/15`
 *  is not a colour until you know the ground, which is the whole reason a
 *  class-name scan cannot answer this question. */
function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha))) as Rgb;
}

/** Resolve a Tailwind colour name to hex, or throw. Reads the INSTALLED
 *  Tailwind rather than a table copied into this file, so the numbers cannot
 *  drift away from what the build actually emits. */
function tailwindHex(hue: string, step: string): string {
  if (hue === "white") return "#ffffff";
  if (hue === "black") return "#000000";
  const scale = (colors as unknown as Record<string, Record<string, string>>)[hue];
  if (!scale) throw new Error(`unknown Tailwind hue "${hue}"`);
  const hex = scale[step];
  if (!hex) throw new Error(`Tailwind has no ${hue}-${step}`);
  return hex;
}

const COLOUR_CLASS = /(?:^|\s)(?:hover:)?(bg|text|border)-([a-z]+)(?:-(\d{2,3}))?(?:\/(\d{1,3}))?(?=\s|$)/g;

interface ParsedColour {
  prop: "bg" | "text" | "border";
  hex: string;
  alpha: number;
  hover: boolean;
  raw: string;
}

/** Decompose a class string into the colours it declares. Anything shaped like
 *  a colour utility but not resolvable throws, per rule 3. */
function parseColours(classes: string): ParsedColour[] {
  const out: ParsedColour[] = [];
  for (const m of classes.matchAll(COLOUR_CLASS)) {
    const [raw, prop, hue, step, alpha] = m;
    // Semantic tokens route through CSS variables and are the system working
    // as intended; they are out of this file's reach and are not failures.
    if (["background", "foreground", "muted", "border", "card", "primary", "ring"].includes(hue))
      continue;
    if (hue !== "white" && hue !== "black" && !step) continue;
    out.push({
      prop: prop as ParsedColour["prop"],
      hex: tailwindHex(hue, step ?? ""),
      alpha: alpha ? Number(alpha) / 100 : 1,
      hover: raw.includes("hover:"),
      raw: raw.trim(),
    });
  }
  return out;
}

/** The grounds a tinted pill can sit on, taken from the palette's own
 *  declarations rather than guessed. `raised` (slate-800) is the LIGHTEST of
 *  them, so it is the worst case for light text: anything that clears it also
 *  clears `panel` (slate-900) and the slate-950 drawers. Both are measured
 *  anyway, because a report that only prints the worst case teaches nobody
 *  where the margin went. */
const GROUNDS = {
  panel: parseColours(ADMIN_GROUND.panel).find((c) => c.prop === "bg")!.hex,
  raised: parseColours(ADMIN_GROUND.raised).find((c) => c.prop === "bg")!.hex,
};

/** Measure one triad: the text step against its own wash over a ground. */
function measure(classes: string, groundHex: string) {
  const parsed = parseColours(classes).filter((c) => !c.hover);
  const text = parsed.find((c) => c.prop === "text");
  const wash = parsed.find((c) => c.prop === "bg");
  if (!text) throw new Error(`no text colour in "${classes}"`);
  const ground = parseHex(groundHex);
  const behind = wash ? composite(parseHex(wash.hex), wash.alpha, ground) : ground;
  return contrast(parseHex(text.hex), behind);
}

const round = (n: number) => Math.round(n * 100) / 100;

describe("the measuring apparatus is honest before it is used", () => {
  it("agrees with the WCAG reference pairs", () => {
    // Black on white is exactly 21:1 and a colour on itself is exactly 1:1.
    // If either drifts, every number below this line is fiction.
    expect(round(contrast(parseHex("#000000"), parseHex("#ffffff")))).toBe(21);
    expect(round(contrast(parseHex("#777777"), parseHex("#777777")))).toBe(1);
    // A known third value, so a sign error cannot hide between the extremes.
    expect(round(contrast(parseHex("#767676"), parseHex("#ffffff")))).toBe(4.54);
  });

  it("resolves a wash against its ground rather than against nothing", () => {
    // 15% white over black is a dark grey, not white. A composite that ignored
    // alpha would report 21:1 here and pass everything.
    expect(composite([255, 255, 255], 0.15, [0, 0, 0])).toEqual([38, 38, 38]);
  });

  it("refuses a class it cannot resolve instead of skipping it", () => {
    expect(() => tailwindHex("nosuchhue", "500")).toThrow(/unknown Tailwind hue/);
    expect(() => tailwindHex("emerald", "1234")).toThrow(/no emerald-1234/);
    expect(() => measure("bg-emerald-500/15 border-emerald-500/30", GROUNDS.raised)).toThrow(
      /no text colour/,
    );
  });

  it("reads the real Tailwind build, not a table copied in here", () => {
    expect(tailwindHex("slate", "900")).toBe(ADMIN_GROUND.panel.includes("slate-900") ? colors.slate[900] : "");
    expect(GROUNDS.raised).toBe(colors.slate[800]);
  });
});

describe("every tinted pill in the palette is readable", () => {
  const report: string[] = [];

  it("badge, panel-with-text, chip and standalone text clear 4.5:1", () => {
    const failures: string[] = [];
    for (const [tone, triad] of Object.entries(ADMIN_TONE)) {
      for (const form of ["badge", "chip", "text"] as const) {
        for (const [groundName, groundHex] of Object.entries(GROUNDS)) {
          const ratio = measure(triad[form], groundHex);
          report.push(`${tone}.${form} on ${groundName}: ${round(ratio)}`);
          if (ratio < AA_TEXT) failures.push(`${tone}.${form} on ${groundName}: ${round(ratio)}`);
        }
      }
    }
    expect(failures, `tinted text below ${AA_TEXT}:1:\n  ${failures.join("\n  ")}`).toEqual([]);
  });

  it("the heavy pill and the category hues clear it too", () => {
    const failures: string[] = [];
    for (const [name, classes] of [
      ...Object.entries(ADMIN_BADGE_STRONG),
      ...Object.entries(ADMIN_CATEGORY),
    ]) {
      for (const [groundName, groundHex] of Object.entries(GROUNDS)) {
        const ratio = measure(classes as string, groundHex);
        if (ratio < AA_TEXT) failures.push(`${name} on ${groundName}: ${round(ratio)}`);
      }
    }
    expect(failures, `tinted text below ${AA_TEXT}:1:\n  ${failures.join("\n  ")}`).toEqual([]);
  });

  it("the timeline's tinted headers clear it", () => {
    const failures: string[] = [];
    for (const [name, entry] of Object.entries(ADMIN_TIMELINE)) {
      // `muted` carries a dot and no text on purpose; a missing text entry is
      // nothing to measure, but a PRESENT one that cannot be read is.
      if (!entry.text) continue;
      for (const [groundName, groundHex] of Object.entries(GROUNDS)) {
        const ratio = measure(entry.text, groundHex);
        if (ratio < AA_TEXT) failures.push(`${name} on ${groundName}: ${round(ratio)}`);
      }
    }
    expect(failures, `tinted text below ${AA_TEXT}:1:\n  ${failures.join("\n  ")}`).toEqual([]);
  });

  it("status dots stay distinguishable from the ground at 3:1", () => {
    // A dot is not text, so it answers to the non-text bar. It is never the
    // only carrier of meaning (a label always sits beside it), but a dot you
    // cannot see is still a dot doing nothing.
    const failures: string[] = [];
    for (const [tone, triad] of Object.entries(ADMIN_TONE)) {
      const dot = parseColours(triad.dot).find((c) => c.prop === "bg");
      if (!dot) throw new Error(`${tone}.dot declares no background`);
      const ratio = contrast(parseHex(dot.hex), parseHex(GROUNDS.raised));
      if (ratio < AA_NON_TEXT) failures.push(`${tone}.dot: ${round(ratio)}`);
    }
    expect(failures, `status dots below ${AA_NON_TEXT}:1:\n  ${failures.join("\n  ")}`).toEqual([]);
  });
});

describe("the committing buttons are readable at rest, not only on hover", () => {
  it("every ADMIN_SOLID label clears 4.5:1 against its own resting ground", () => {
    // The original failure. `bg-amber-600 text-white` measured 3.19:1 while
    // its hover state measured 5.02:1, so the button became readable at the
    // exact moment you had already decided to press it.
    const failures: string[] = [];
    for (const [tone, classes] of Object.entries(ADMIN_SOLID)) {
      const parsed = parseColours(classes as string);
      const resting = parsed.find((c) => c.prop === "bg" && !c.hover);
      const label = parsed.find((c) => c.prop === "text");
      if (!resting) throw new Error(`${tone} declares no resting background`);
      if (!label) throw new Error(`${tone} declares no label colour`);
      const ratio = contrast(parseHex(label.hex), parseHex(resting.hex));
      if (ratio < AA_TEXT) failures.push(`${tone} (${resting.raw}): ${round(ratio)}`);
    }
    expect(
      failures,
      `a committing button's label is below ${AA_TEXT}:1 at rest:\n  ${failures.join("\n  ")}`,
    ).toEqual([]);
  });

  it("and on hover, which must not be the first legible state", () => {
    const failures: string[] = [];
    for (const [tone, classes] of Object.entries(ADMIN_SOLID)) {
      const parsed = parseColours(classes as string);
      const hover = parsed.find((c) => c.prop === "bg" && c.hover);
      const label = parsed.find((c) => c.prop === "text");
      if (!hover) throw new Error(`${tone} declares no hover background`);
      const ratio = contrast(parseHex(label!.hex), parseHex(hover.hex));
      if (ratio < AA_TEXT) failures.push(`${tone} hover: ${round(ratio)}`);
    }
    expect(failures, `a hover state is below ${AA_TEXT}:1:\n  ${failures.join("\n  ")}`).toEqual([]);
  });

  it("hover stays a darkening, so the idiom does not invert with the fix", () => {
    // Every solid button darkens one step on hover. Raising the resting step
    // to fix contrast must keep that direction, or the fix would smuggle an
    // interaction change into a colour change.
    for (const [tone, classes] of Object.entries(ADMIN_SOLID)) {
      const parsed = parseColours(classes as string);
      const resting = parsed.find((c) => c.prop === "bg" && !c.hover)!;
      const hover = parsed.find((c) => c.prop === "bg" && c.hover)!;
      expect(
        relativeLuminance(parseHex(hover.hex)),
        `${tone} lightens on hover; every other solid darkens`,
      ).toBeLessThan(relativeLuminance(parseHex(resting.hex)));
    }
  });
});

/**
 * The half the palette cannot reach.
 *
 * Fixing `ADMIN_SOLID` alone would have LOOKED complete and left the defect
 * in place: 19 admin call sites wrote their own solid button rather than
 * importing the map, and the worst of them measured 2.54:1, well below the
 * three the palette itself was failing at. A fix that repaired the
 * definition site while `bg-emerald-500 text-white` stayed on the selected
 * payouts tab is the kind of green suite this project has already been
 * burned by.
 *
 * The pattern is narrow enough to check statically and only that pattern is
 * checked: a single string literal that declares BOTH a solid (fully opaque)
 * saturated ground and a white label. Both parts in one literal, because
 * `cond ? "bg-emerald-500" : "bg-slate-800"` puts two grounds in one
 * className and only one of them is behind the text at a time; requiring
 * co-location in the same literal is conservative, and a conservative check
 * that never lies beats a broad one that guesses.
 *
 * What it deliberately does not attempt: a translucent wash at a call site,
 * whose ground depends on the element above it and cannot be resolved from
 * source. Those belong to the palette half of this file, which is why the
 * ratchet in `colour-law` pushing call sites toward the maps is the real fix
 * and this is the floor underneath it.
 */
describe("no admin call site writes an unreadable white label", () => {
  const ADMIN_DIRS = ["src/components/admin"];

  /** Strip comments WITHOUT collapsing lines. The first version of this scan
   *  replaced block comments with "" and every reported line number after the
   *  first multi-line comment in a file was wrong, which sent the fix to the
   *  wrong lines until the numbers were checked by hand. */
  const stripComments = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

  function walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  const ROOT = path.resolve(__dirname, "../..");
  const FILES = [
    ...ADMIN_DIRS.flatMap((d) => walk(path.join(ROOT, d))),
    ...walk(path.join(ROOT, "src/pages")).filter((f) => /\/Admin[A-Z]/.test(f)),
  ];

  it("finds the admin surface to scan", () => {
    // Rule 3: a scan over an empty file list reports zero failures and looks
    // exactly like a pass.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("every solid ground under a white label clears 4.5:1", () => {
    const failures: string[] = [];
    for (const file of FILES) {
      stripComments(fs.readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          for (const segment of line.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? []) {
            if (!/\btext-white\b/.test(segment)) continue;
            // `(?![/\w])` excludes `bg-red-500/15`: a wash is not a solid.
            for (const m of segment.matchAll(/\bbg-([a-z]+)-(\d{3})\b(?![/\w])/g)) {
              const [raw, hue, step] = m;
              let hex: string;
              try {
                hex = tailwindHex(hue, step);
              } catch {
                continue; // not a Tailwind palette hue (a semantic token, say)
              }
              const ratio = contrast(parseHex("#ffffff"), parseHex(hex));
              if (ratio < AA_TEXT) {
                failures.push(
                  `${path.relative(ROOT, file)}:${i + 1}  ${raw} (${hex})  ${round(ratio)}`,
                );
              }
            }
          }
        });
    }
    expect(
      failures,
      `a white label sits on a ground below ${AA_TEXT}:1. Use the 700 step, ` +
        `or ADMIN_SOLID where the control commits a judgement:\n  ${failures.join("\n  ")}`,
    ).toEqual([]);
  });

  it("recognises the shape it is looking for", () => {
    // The scan is only as good as its pattern, so pin the pattern itself
    // against a known-bad and a known-good string. Without this, a regex typo
    // silently turns the check above into a check of nothing.
    const bad = 'className="px-3 bg-emerald-500 text-white rounded"';
    const good = 'className="px-3 bg-emerald-700 text-white rounded"';
    const wash = 'className="bg-emerald-500/15 text-white rounded"';
    const solids = (s: string) =>
      [...s.matchAll(/\bbg-([a-z]+)-(\d{3})\b(?![/\w])/g)].map(
        (m) => contrast(parseHex("#ffffff"), parseHex(tailwindHex(m[1], m[2]))) < AA_TEXT,
      );
    expect(solids(bad)).toEqual([true]);
    expect(solids(good)).toEqual([false]);
    expect(solids(wash), "a translucent wash is not a solid ground").toEqual([]);
  });
});
