/**
 * A hover state moves one way, and which way depends on what is hovered.
 *
 * The admin back office pairs a resting `bg-HUE-N` with a `hover:bg-HUE-M` in
 * 86 places, and until this guard landed those 86 disagreed about the
 * direction. Measured across the surface:
 *
 *   - neutral ground (slate) always LIFTS: `bg-slate-800 hover:bg-slate-700`,
 *     `bg-slate-700 hover:bg-slate-600`, 29 sites, no exceptions. On a dark
 *     ground a neutral surface acknowledges the pointer by coming up toward
 *     the light. That is the same thing every dark theme does.
 *   - saturated solids DARKEN: `bg-emerald-600 hover:bg-emerald-700`, which is
 *     what `ADMIN_SOLID` in the palette has encoded since batch 7. A colour
 *     that is already carrying meaning at full saturation cannot get louder
 *     on hover without competing with itself, so it deepens instead.
 *
 * 27 solids went the other way (`bg-blue-600 hover:bg-blue-500`) against 32
 * that followed the palette, which is close enough to an even split that
 * nobody would have noticed by reading; it took counting. The visible symptom
 * was two buttons side by side on AdminDisputes, one deepening and one
 * brightening under the same pointer.
 *
 * The pairing rule is nearest-preceding-same-hue rather than
 * anything-on-the-line, and that detail is the whole guard. A first version
 * paired every hover with the largest same-line solid and reported both a
 * false violation and a false clean on `AdminNotifications`, whose toggle
 * writes two complete pairs in one ternary
 * (`bg-amber-700 hover:bg-amber-800` : `bg-amber-600 hover:bg-amber-700`).
 * Both are correct; only the naive pairing thought otherwise.
 *
 * Scope note, per the standing rule that a check which cannot see something
 * has to say so: the customer surface contains ZERO such pairs, because it
 * routes through semantic tokens. Its clean report here is emptiness, not
 * compliance, and this guard protects it only against a future raw-hue hover
 * arriving in the wrong direction.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

/** Slate and its siblings are the ground, not a judgement. */
const NEUTRAL = new Set(["slate", "gray", "zinc", "neutral", "stone"]);

const HUES = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose",
];

// The negative lookahead drops `/20` washes: a translucent hover is an
// opacity move, not a shade move, and it plays by different rules.
const TOKEN = new RegExp(`(hover:)?bg-(${HUES.join("|")})-(\\d{2,3})(?![\\d/])`, "g");

function sources(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // ui/ is vendored shadcn and __tests__ is this file's own neighbourhood.
      if (entry.name === "ui" || entry.name === "__tests__") continue;
      sources(full, out);
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

interface Pair {
  where: string;
  hue: string;
  base: number;
  hover: number;
}

/** Every (resting, hover) pair the source states, paired by proximity. */
export function hoverPairs(files: string[]): Pair[] {
  const pairs: Pair[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      const toks = [...line.matchAll(TOKEN)].map((m) => ({
        isHover: Boolean(m[1]),
        hue: m[2],
        shade: Number(m[3]),
      }));
      toks.forEach((tok, k) => {
        if (!tok.isHover) return;
        const preceding = toks.slice(0, k).filter((t) => !t.isHover && t.hue === tok.hue);
        if (preceding.length === 0) return;
        pairs.push({
          where: `${rel}:${idx + 1}`,
          hue: tok.hue,
          base: preceding[preceding.length - 1].shade,
          hover: tok.shade,
        });
      });
    });
  }
  return pairs;
}

describe("hover states move in one direction per surface", () => {
  const pairs = hoverPairs(sources());

  it("sees the pairs it is meant to police", () => {
    // A silent pass here would mean the regex stopped matching, not that the
    // surface got clean. Prefer a loud failure.
    expect(pairs.length).toBeGreaterThan(50);
  });

  it("darkens saturated solids on hover, as ADMIN_SOLID does", () => {
    const wrong = pairs
      .filter((p) => !NEUTRAL.has(p.hue))
      .filter((p) => p.hover <= p.base)
      .map((p) => `${p.where}  bg-${p.hue}-${p.base} -> hover:bg-${p.hue}-${p.hover}`);
    expect(wrong).toEqual([]);
  });

  it("lifts the neutral ground on hover", () => {
    const wrong = pairs
      .filter((p) => NEUTRAL.has(p.hue))
      .filter((p) => p.hover >= p.base)
      .map((p) => `${p.where}  bg-${p.hue}-${p.base} -> hover:bg-${p.hue}-${p.hover}`);
    expect(wrong).toEqual([]);
  });
});
