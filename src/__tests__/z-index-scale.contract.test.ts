import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Stacking order is a shared contract: every layer must come from the semantic
 * scale in tailwind.config.ts (z-rail < z-sticky < z-overlay < z-sheet <
 * z-modal < z-toast). Arbitrary values and raw numeric tiers re-open the
 * "which thing is on top" bugs the scale was introduced to end.
 */
const SRC = path.join(process.cwd(), "src");
const TIERS = ["rail", "sticky", "overlay", "sheet", "modal", "toast"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);

describe("z-index scale", () => {
  it("tailwind declares the full semantic scale in ascending order", () => {
    const cfg = fs.readFileSync(path.join(process.cwd(), "tailwind.config.ts"), "utf-8");
    const values = TIERS.map((t) => {
      const m = cfg.match(new RegExp(`${t}:\\s*"(\\d+)"`));
      expect(m, `missing z-${t}`).toBeTruthy();
      return Number(m![1]);
    });
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it("no arbitrary z-[...] values in src", () => {
    const violations: string[] = [];
    for (const f of FILES) {
      fs.readFileSync(f, "utf-8").split("\n").forEach((line, i) => {
        if (/\bz-\[/.test(line)) violations.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
      });
    }
    expect(violations).toEqual([]);
  });

  it("no raw numeric z-tiers above z-0 in src", () => {
    const violations: string[] = [];
    for (const f of FILES) {
      fs.readFileSync(f, "utf-8").split("\n").forEach((line, i) => {
        const m = line.match(/(?:^|[\s"'`:])(?:[a-z]+:)*-?z-(\d+)\b/g);
        if (!m) return;
        for (const hit of m) {
          const n = Number(hit.match(/z-(\d+)/)![1]);
          if (n > 0) violations.push(`${path.relative(process.cwd(), f)}:${i + 1} → ${hit.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
