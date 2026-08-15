import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const SMALL = new Set(["3", "3.5", "4", "5", "6", "7", "8", "9", "10"]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

function linesBefore(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

/**
 * Intentionally narrow exceptions. These are visual primitives whose actual
 * interactive parent owns the 44px hit area, not standalone controls.
 */
const ALLOWLIST: Array<{ file: string; contains: string; reason: string }> = [];

describe("mobile touch targets", () => {
  it("has a documented reason for every exception", () => {
    for (const item of ALLOWLIST) expect(item.reason.trim().length).toBeGreaterThan(20);
  });

  it("finds no explicit sub-44px raw interactive target", () => {
    const violations: string[] = [];
    const tag = /<(button|a|input|select|textarea)\b[^>]*?className="([^"]*)"[^>]*>/gs;

    for (const absolute of tsxFiles(ROOT)) {
      const file = relative(process.cwd(), absolute).replace(/\\/g, "/");
      const source = readFileSync(absolute, "utf8");
      for (const match of source.matchAll(tag)) {
        const classes = match[2].split(/\s+/);
        const smallHeight = classes.find((c) => c.startsWith("h-") && SMALL.has(c.slice(2)));
        const smallWidth = classes.find((c) => c.startsWith("w-") && SMALL.has(c.slice(2)));
        if (!smallHeight && !(smallWidth && classes.some((c) => c.startsWith("h-")))) continue;
        if (classes.some((c) => c === "h-11" || c === "min-h-11" || c.includes("before:-inset"))) continue;

        const allowed = ALLOWLIST.some((item) => item.file === file && match[0].includes(item.contains));
        if (!allowed) violations.push(`${file}:${linesBefore(source, match.index ?? 0)} ${smallHeight ?? ""} ${smallWidth ?? ""}`.trim());
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not hide actionable controls behind hover on touch screens", () => {
    const violations: string[] = [];
    for (const absolute of tsxFiles(ROOT)) {
      const file = relative(process.cwd(), absolute).replace(/\\/g, "/");
      const source = readFileSync(absolute, "utf8");
      source.split("\n").forEach((line, index) => {
        if (/opacity-0.*group-hover|group-hover.*opacity-100/.test(line) && !/md:opacity-0/.test(line)) {
          violations.push(`${file}:${index + 1}`);
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});