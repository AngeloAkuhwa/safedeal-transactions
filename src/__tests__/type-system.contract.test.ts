/**
 * @vitest-environment node
 *
 * One heading face, one heading scale (plan 2.3, decision D3: Archivo).
 *
 * Two failure modes this guards:
 *
 * 1. The face silently falling off a heading step. Every fluid heading
 *    utility must route through the single token, because a step that
 *    hardcodes its family (or forgets one) drifts the moment anyone tunes
 *    the knob. The token, the @font-face and the preload must all exist:
 *    losing any one of the three degrades every heading at once, and a
 *    missing preload does it only on slow connections, where nobody in CI
 *    would ever see it.
 *
 * 2. New fixed-size heroes creeping back in. Before 2.3, 30 customer
 *    headings sat at a fixed text-3xl (or a hand-stepped sm:/lg: ladder)
 *    while the landing flowed with clamps: two type systems. Customer
 *    h1-h3 now use the h-* utilities; a fixed 3xl-or-larger step on a
 *    customer heading is the old pattern returning.
 *
 * Blind spots, written down per the working agreement: the heading scan
 * only sees an <h1>-<h3> whose className sits inside the same tag (JSX
 * attribute spans are covered because [^>] crosses newlines, but a class
 * assembled in a variable or cn() call defined elsewhere is invisible),
 * and it does not police divs styled as headings. Numbers (money,
 * countdowns, scores) deliberately keep the body face for its tabular
 * figures, which is why the ban is scoped to h tags rather than to every
 * large text step.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync("src/index.css", "utf8");
const html = readFileSync("index.html", "utf8");

const HEADING_UTILITIES = [
  ".h-display",
  ".h-section",
  ".h-card",
  ".h-page",
  ".h-hero",
  ".sd-page-title",
];

describe("the display face has one knob", () => {
  it("the token, the @font-face and the preload all exist", () => {
    expect(css).toMatch(/--font-display:\s*'Archivo'/);
    expect(css).toMatch(/@font-face\s*\{[^}]*font-family:\s*'Archivo'/);
    expect(css).toContain("/fonts/archivo-latin-var.woff2");
    expect(html).toContain("/fonts/archivo-latin-var.woff2");
  });

  it("every heading utility routes through the token", () => {
    for (const util of HEADING_UTILITIES) {
      const line = new RegExp(
        `\\${util}\\s*\\{[^}]*font-family:\\s*var\\(--font-display\\)`,
      );
      expect(css, `${util} must use var(--font-display)`).toMatch(line);
    }
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // The admin exemption is gone (plan 6.3). It read "admin polish is
      // deliberately last", and by the time it was lifted the surface
      // already satisfied the rule: measuring found zero admin h1-h3 at a
      // fixed 3xl or larger. So this closes the door rather than clearing
      // a backlog, which is the honest description of what it did.
      walk(full, out);
    } else if (full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("customer headings use the fluid scale", () => {
  it("no customer h1-h3 carries a fixed 3xl-or-larger step", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const source = readFileSync(file, "utf8");
      const match = /<h[1-3][^>]*text-(3xl|4xl|5xl)/.exec(source);
      if (match) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${file}:${line}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
