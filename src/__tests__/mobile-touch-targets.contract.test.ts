import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  MIN_TARGET_PX,
  MIN_FONT_PX,
  scanRepo,
  scanSource,
  scanKeyboardRepo,
  scanFontRepo,
  measure,
  classNamesOf,
  readOpeningTag,
} from "./helpers/touch-target-scan";

const ROOT = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * Intentionally narrow exceptions. These are visual primitives whose actual
 * interactive parent owns the 44px hit area, not standalone controls.
 */
const ALLOWLIST: Array<{ file: string; contains: string; reason: string }> = [];

describe("touch-target scanner behaves", () => {
  it("parses past arrow functions inside the opening tag", () => {
    const src = `<button onClick={() => go()} className="h-8 w-8" />`;
    expect(classNamesOf(readOpeningTag(src, 0)!.text)).toContain("h-8");
  });

  it("resolves cn() and template-literal classNames", () => {
    expect(classNamesOf(`<Button className={cn("h-9 px-2", other)} />`)).toContain("h-9");
    expect(classNamesOf("<Button className={`h-7 ${x}`} />")).toContain("h-7");
  });

  it("ignores className props belonging to nested JSX", () => {
    expect(classNamesOf(`<Tile icon={<Eye className="h-3 w-3" />} onClick={() => {}} />`)).toEqual([]);
  });

  it("understands shadcn size variants, size-*, min-h-* and padding", () => {
    expect(measure(`<Button size="icon" />`, "Button").height).toBe(44);
    expect(measure(`<button className="size-6" />`, "button").height).toBe(24);
    expect(measure(`<button className="py-1 px-2.5" />`, "button").height).toBe(28);
    expect(measure(`<button className="h-8 w-8 before:-inset-2" />`, "button").height).toBe(48);
  });

  it("flags capitalised components, not just lowercase tags", () => {
    expect(scanSource(`<SelectTrigger className="h-8 sm:w-52" />`, "x.tsx")).toHaveLength(1);
    expect(scanSource(`<Checkbox className="h-3.5 w-3.5" />`, "x.tsx")).toHaveLength(1);
  });
});

describe("mobile touch targets", () => {
  it("has a documented reason for every exception", () => {
    for (const item of ALLOWLIST) expect(item.reason.trim().length).toBeGreaterThan(20);
  });

  it(`finds no interactive target under ${MIN_TARGET_PX}px`, () => {
    const violations = scanRepo("src")
      .filter((v) => !v.file.includes("__tests__"))
      .filter((v) => !ALLOWLIST.some((a) => a.file === v.file && v.snippet.includes(a.contains)))
      .map((v) => `${v.file}:${v.line} <${v.tag}> ${v.reason} | ${v.snippet.slice(0, 120)}`);
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

describe("keyboard operability", () => {
  it("every clickable non-interactive element is focusable and key-activatable", () => {
    const violations = scanKeyboardRepo("src")
      .filter((v) => !v.file.includes("__tests__"))
      .map((v) => `${v.file}:${v.line} <${v.tag}> ${v.reason}`);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

describe("legibility floor", () => {
  it(`ships no arbitrary font size below ${MIN_FONT_PX}px`, () => {
    const violations = scanFontRepo("src")
      .filter((v) => !v.file.includes("__tests__"))
      .map((v) => `${v.file}:${v.line} ${v.reason}`);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
