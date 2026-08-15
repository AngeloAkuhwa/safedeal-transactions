/**
 * Mobile viewport height contract.
 * `h-screen` / `min-h-screen` use `100vh`, which is taller than the visible
 * area on mobile browsers (URL bar) and locks scrolling inside shells.
 * Only `lg:`-prefixed (desktop) usages are allowed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("viewport height units", () => {
  it("uses dvh instead of vh for mobile-visible shells", () => {
    const violations: string[] = [];
    for (const absolute of tsxFiles(ROOT)) {
      const file = relative(process.cwd(), absolute).replace(/\\/g, "/");
      readFileSync(absolute, "utf8").split("\n").forEach((line, index) => {
        for (const match of line.matchAll(/(^|[\s"'`:])((?:[a-z]+:)*)(min-h-screen|h-screen)\b/g)) {
          const variants = match[2];
          if (variants.includes("lg:") || variants.includes("xl:")) continue;
          violations.push(`${file}:${index + 1} ${match[3]}`);
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
