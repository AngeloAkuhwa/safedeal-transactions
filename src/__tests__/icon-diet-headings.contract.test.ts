/**
 * A heading says what a section is. It does not need a picture of it.
 *
 * 47 section headings across 22 customer screens opened with a decorative
 * `h-5 w-5 text-primary` glyph before the words. `BuyerTransactionDetail` had
 * ten of them down one page, and two of the ten icons were repeats: BadgeCheck
 * and FileText each appeared twice, so the glyph was not even distinguishing
 * one section from another. It was texture.
 *
 * This is the "icon prefixed headings" line in the standing design debt, and
 * the reason it is called out is that it is the largest contributor to the
 * assembled feel: a column of primary-coloured marks down the left edge of a
 * page, none of them telling you anything the heading beside them does not.
 *
 * Decorative is the operative word. An icon that carries state, or that is the
 * only content of a control, is a different thing and is not what this bans:
 * the check only looks at an icon sitting immediately inside a heading, before
 * any text.
 *
 * Two things this test is careful about, both learned the hard way in this
 * repo:
 *
 *   - it resolves icon names from the file's own `lucide-react` import rather
 *     than assuming any capitalised tag is an icon. A first pass flagged
 *     `<Link>` inside an `<h3>` as an icon, which would have sent someone to
 *     delete a page's only keyboard-reachable control.
 *   - it strips `{/* … *\/}` as a unit. Stripping the inner comment first
 *     leaves `{}`, which then reads as an empty JSX expression and shifts what
 *     the next pattern matches.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

function tsxFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Admin and the shadcn primitives are out of scope, the same split the colour
 * law uses. Admin is the back office and no customer ever sees it.
 */
const isCustomer = (rel: string) =>
  !rel.startsWith("src/components/admin/") &&
  !/^src\/pages\/Admin/.test(rel) &&
  !rel.startsWith("src/components/ui/") &&
  !rel.includes("__tests__");

/** `{/* … *\/}` as a unit, then block and line comments. Order matters. */
const stripComments = (s: string) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

function lucideNames(src: string): Set<string> {
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*"lucide-react";/s);
  if (!m) return new Set();
  return new Set(
    m[1]
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/).pop()!.trim())
      .filter(Boolean),
  );
}

describe("headings carry words, not icons", () => {
  const files = tsxFiles();

  it("finds the components to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no icon sitting inside a heading before its text", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (!isCustomer(rel)) continue;

      const raw = fs.readFileSync(file, "utf8");
      const icons = lucideNames(raw);
      if (!icons.size) continue;
      const src = stripComments(raw);

      for (const m of src.matchAll(/<(?:h[1-6]|CardTitle)\b[^>]*>\s*<([A-Z][A-Za-z0-9]*)[\s/]/g)) {
        const tag = m[1];
        if (!icons.has(tag)) continue;
        const line = src.slice(0, m.index ?? 0).split("\n").length;
        offenders.push(`${rel}:${line}  <${tag} /> before the heading text`);
      }
    }

    expect(
      offenders,
      `icon-prefixed heading in ${offenders.length} place(s):\n  ${offenders.join("\n  ")}\n` +
        "The heading already says what the section is. Delete the icon and " +
        "drop the now-pointless flex row from the heading's className. If the " +
        "icon genuinely carries state the words do not, put it on the content " +
        "rather than on the heading.",
    ).toEqual([]);
  });
});
