/**
 * A small icon does not need a box around it.
 *
 * 95 of these across 61 customer files:
 *
 *   <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
 *     <ShieldCheck className="h-5 w-5 text-primary" />
 *   </div>
 *
 * A fixed square, a rounded corner and a tinted wash whose entire job is to
 * hold one glyph. Repeated down a page beside every row and every sub-heading,
 * it is the "w-10 h-10 rounded-lg bg-primary/10 tile pattern" the standing
 * design debt names, and the second half of the icon diet after the
 * icon-prefixed headings.
 *
 * The tile goes and the icon stays, keeping its tone and any class that
 * positioned the tile in its parent (shrink-0, mt-0.5, mx-auto).
 *
 * The size range is the whole rule, and it was arrived at by looking rather
 * than by taste. Two different things matched the same shape:
 *
 *   - w-8 to w-12 tiles repeat. They sit beside list rows, feature bullets and
 *     sub-headings, several to a screen, and they are texture.
 *   - w-14 and up do not repeat. They are the single large mark that anchors a
 *     page or an empty state, like the Ban on the cancelled-transaction page.
 *     Removing those would strip a page's focal point rather than reduce
 *     noise, so 36 of them are deliberately left alone.
 *
 * Interactive elements were never in scope and are excluded structurally: this
 * only matches a plain `<div>` with no hover state whose only child is an
 * icon. An earlier, looser className-only count of 128 swept in 44px `<button>`
 * controls (save, share, quantity plus and minus) and a product-image
 * container, which would have been a real regression if it had been acted on.
 *
 * "An icon" means a component imported from `lucide-react` in that same file,
 * not merely a capitalised tag. The first version of this check took any
 * capitalised child, and the day a raw `<img>` was replaced with
 * `<ProductImage />` it flagged
 *
 *   <div className="w-10 h-10 rounded-lg border overflow-hidden bg-muted">
 *     <ProductImage ... />
 *   </div>
 *
 * as a decorative tile. It is not: the `bg-muted` is the placeholder behind a
 * photo that has not loaded and the `overflow-hidden` is what clips the photo
 * to the rounded corner. Deleting that wrapper would have removed both.
 *
 * That is the same mistake as `ArrowLeftRight` in the back-affordance guard
 * and `<Link>` in the heading guard: matching on the shape of a tag instead of
 * on what it is. The heading guard already resolves names from the import and
 * this one now does too.
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

const isCustomer = (rel: string) =>
  !rel.startsWith("src/components/admin/") &&
  !/^src\/pages\/Admin/.test(rel) &&
  !rel.startsWith("src/components/ui/") &&
  !rel.includes("__tests__");

/**
 * A plain div, no hover state, equal width and height in the repeating range,
 * rounded, tinted, whose only child is one self-closing element. Whether that
 * element is an ICON is decided separately, from the file's own imports.
 */
const TILE = new RegExp(
  String.raw`<div\s+className="(?![^"]*hover:)(?=[^"]*\b[wh]-(8|9|10|11|12)\b)(?=[^"]*\b[hw]-\1\b)` +
    String.raw`(?=[^"]*rounded-)(?=[^"]*\bbg-(?:primary|success|warning|destructive|muted|accent)[\w/.-]*)` +
    String.raw`[^"]*"\s*>\s*<([A-Z][A-Za-z0-9.]*)\s[^>]*/>\s*</div>`,
  "gs",
);

/**
 * The names this file imports from lucide-react, which is what "icon" means.
 *
 * The component name is capture group TWO, not one. Group one is the size,
 * which has to be a real capture because the pattern backreferences it to
 * require width and height to match. Reading `m[1]` here compared the icon
 * name against "10" and never matched, so the check passed on every file
 * including ones with real tiles in them. It was green and blind for exactly
 * as long as it took to test it against a tile instead of against a clean
 * tree, which is the whole argument for verifying a guard red rather than
 * only verifying it green.
 */
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

/** `{/* … *\/}` as a unit first, so stripping cannot leave a bare `{}`. */
const stripComments = (s: string) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

describe("small icons do not get a box", () => {
  const files = tsxFiles();

  it("finds the components to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no decorative icon tile in the repeating size range", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (!isCustomer(rel)) continue;
      const raw = fs.readFileSync(file, "utf8");
      const icons = lucideNames(raw);
      if (!icons.size) continue;
      const src = stripComments(raw);
      for (const m of src.matchAll(TILE)) {
        const name = m[2];
        if (!icons.has(name)) continue;
        const line = src.slice(0, m.index ?? 0).split("\n").length;
        offenders.push(`${rel}:${line}  <${name} />`);
      }
    }

    expect(
      offenders,
      `decorative icon tile in ${offenders.length} place(s):\n  ${offenders.join("\n  ")}\n` +
        "Drop the wrapper and keep the icon, carrying over only the classes " +
        "that positioned the tile in its parent (shrink-0, mt-0.5, mx-auto). " +
        "If the mark is a single page-level anchor rather than a repeating " +
        "row decoration, size it w-14 or larger, which is out of scope here.",
    ).toEqual([]);
  });
});
