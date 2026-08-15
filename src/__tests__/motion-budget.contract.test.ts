import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Motion budget
 * -------------
 * `animate-pulse` is reserved for LOADING skeletons. Decorative "this is live"
 * motion (presence dots, status dots, current-step markers) must use the
 * `.sd-live-dot` utility, which carries a `prefers-reduced-motion` guard.
 */
const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "test") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

const FILES = walk(SRC);
const SKELETON_HINT = /skeleton|bg-muted|rounded\s|h-\d|w-\d/i;

describe("motion budget", () => {
  it("reduced-motion guard exists for both pulse mechanisms", () => {
    const css = fs.readFileSync(path.join(SRC, "index.css"), "utf-8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain(".sd-live-dot");
    expect(block).toContain(".animate-pulse");
  });

  it("the .sd-live-dot utility is actually applied, not merely defined", () => {
    const users = FILES.filter((f) => fs.readFileSync(f, "utf-8").includes("sd-live-dot"));
    expect(users.length).toBeGreaterThan(20);
  });

  it("no decorative dot uses raw animate-pulse", () => {
    const violations: string[] = [];
    for (const f of FILES) {
      fs.readFileSync(f, "utf-8").split("\n").forEach((line, i) => {
        if (!line.includes("animate-pulse")) return;
        if (line.includes("rounded-full") || /\bdot\b/i.test(line)) {
          violations.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("remaining animate-pulse usages look like loading placeholders", () => {
    const violations: string[] = [];
    for (const f of FILES) {
      // Dedicated loading surfaces are allowed to pulse wholesale.
      if (/skeleton|loading|splash/i.test(path.basename(f))) continue;
      fs.readFileSync(f, "utf-8").split("\n").forEach((line, i) => {
        if (line.includes("animate-pulse") && !SKELETON_HINT.test(line)) {
          violations.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("BuyerTransactionReview stays within one pulsing element", () => {
    const s = fs.readFileSync(path.join(SRC, "pages/BuyerTransactionReview.tsx"), "utf-8");
    const pulses = (s.match(/sd-live-dot|animate-pulse/g) ?? []).length;
    expect(pulses).toBe(1);
    expect(s).toContain('className="w-2 h-2 shrink-0 bg-primary-foreground rounded-full sd-live-dot"');
  });
});
