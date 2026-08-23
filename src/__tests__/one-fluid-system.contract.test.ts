/**
 * @vitest-environment node
 *
 * One fluid system: the landing page and the app shell breathe together.
 *
 * The landing page defined fluid utilities (container-x's clamp gutter) and
 * the app shell defined its own stepped ones (sd-page at px-4 sm:px-6
 * lg:px-8), so the same viewport got two different gutters depending on
 * which half of the product drew it. On top of that, three pages hand-rolled
 * a third container (max-w-7xl mx-auto px-4 sm:px-6 lg:px-8) that belonged
 * to neither.
 *
 * Three contracts:
 *
 * 1. sd-page's inline padding is character for character the clamp that
 *    container-x uses. Not "similar": identical, so a tuning edit to one
 *    that forgets the other turns this red instead of quietly reopening the
 *    drift.
 *
 * 2. sd-page-title is clamp-based, so the app's page titles scale on the
 *    same principle as the landing's type instead of stepping at sm:.
 *
 * 3. No component outside the definition hand-rolls the container literal
 *    again. sd-page is the one page gutter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync("src/index.css", "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("one fluid system", () => {
  it("sd-page and container-x share one gutter clamp, character for character", () => {
    const sdPage = /\.sd-page\s*\{[^}]*padding-inline:\s*(clamp\([^)]*\))/.exec(css);
    const containerX = /\.container-x\s*\{[^}]*padding-inline:\s*(clamp\([^)]*\))/.exec(css);
    expect(sdPage, "sd-page must use a fluid padding-inline clamp").toBeTruthy();
    expect(containerX, "container-x must still exist with its clamp").toBeTruthy();
    expect(sdPage![1]).toBe(containerX![1]);
  });

  it("sd-page-title scales fluidly", () => {
    const title = /\.sd-page-title\s*\{[^}]*\}/.exec(css);
    expect(title).toBeTruthy();
    expect(title![0]).toMatch(/font-size:\s*clamp\(/);
  });

  it("no component hand-rolls the page container again", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      if (file.includes("components/landing/")) continue;
      if (readFileSync(file, "utf8").includes("max-w-7xl mx-auto px-4 sm:px-6 lg:px-8")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
