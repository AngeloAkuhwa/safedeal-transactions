/**
 * Dynamic-record-lookup lock.
 *
 * `COPY[null]` and `STATE_STYLES[r.state]` both crashed or blanked a screen for
 * the same reason: an open-keyed style/copy map (`Record<string, { … }>`) was
 * indexed with runtime data and the result dereferenced without a guard. Any
 * value outside the map yields `undefined` and the next property access throws.
 *
 * This test fails on that exact shape: `NAME[expr]` on a `Record<string, {…}>`
 * whose result is immediately dereferenced, or assigned and then dereferenced,
 * with no `??` / `||` fallback.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(e.name) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

/** Open-keyed maps of objects: the shape whose miss is `undefined`. */
const DECL = /const ([A-Za-z_$][\w$]*)\s*:\s*Record<\s*string\s*,\s*\{/g;

/** Individually reviewed exceptions. Keep empty unless a guard is impossible. */
const ALLOWLIST: string[] = [];

describe("dynamic record lookups", () => {
  it("never dereferences an unguarded open-keyed lookup", () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, "src"))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (ALLOWLIST.includes(rel)) continue;
      const src = fs.readFileSync(file, "utf8");
      const names = new Set<string>();
      for (const d of src.matchAll(DECL)) names.add(d[1]);
      for (const name of names) {
        const use = new RegExp(`${name}\\[([^\\]\\n]+)\\]`, "g");
        for (const m of src.matchAll(use)) {
          const key = m[1].trim();
          if (/^["\'`]/.test(key)) continue; // literal key: statically checked
          const after = src.slice(m.index! + m[0].length);
          if (/^\s*(\?\?|\|\|)/.test(after)) continue; // guarded
          if (after.startsWith(".")) {
            offenders.push(`${rel}: ${m[0]} dereferenced without a fallback`);
            continue;
          }
          const before = src.slice(Math.max(0, m.index! - 40), m.index!);
          const assigned = /const (\w+)\s*=\s*$/.exec(before);
          if (assigned && /^\s*;/.test(after)) {
            const deref = new RegExp(`\\b${assigned[1]}\\??\\.`);
            if (deref.test(after)) {
              offenders.push(`${rel}: ${assigned[1]} = ${m[0]} dereferenced without a fallback`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
