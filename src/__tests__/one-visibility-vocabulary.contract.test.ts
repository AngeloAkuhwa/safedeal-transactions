/**
 * Product visibility is named in exactly one place.
 *
 * Five files carried their own copy of the visibility label map, and the
 * copies disagreed in a way a seller could see:
 *
 *   - the storefront filter offered "Private", which selected `buyer_specific`;
 *   - the badge printed "Private" on products that were `private_draft`.
 *
 * So filtering by Private returned every product the badge did not call
 * Private, and hid every product it did. One word, two meanings, six inches
 * apart on one screen. `private_draft` was also "Draft" in the filter and
 * "Private Draft" in the create form, and `buyer_specific` was "Buyer
 * Specific" in four places and "Private" in two.
 *
 * `src/lib/product-visibility.ts` is the single copy. This test is what stops
 * a sixth one from appearing, because the drift did not arrive all at once:
 * each file was individually reasonable when it was written.
 *
 * The rule is narrow on purpose. It bans defining a label *for a visibility
 * value*, not mentioning the values, which components legitimately do when
 * they compare or pass them around.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");
const SOURCE_OF_TRUTH = path.join(SRC, "lib/product-visibility.ts");

function files(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * A visibility value being given a label, a className or a description in the
 * same object literal. `buyer_specific: { label: ... }` and
 * `{ value: "public", label: ... }` are both this shape.
 */
const OWN_MAP =
  /(?:\b(?:public|buyer_specific|private_draft)\s*:\s*\{[^}]*\b(?:label|className|classes)\s*:|value:\s*"(?:public|buyer_specific|private_draft)"[^}]*\blabel\s*:)/;

describe("one visibility vocabulary", () => {
  const all = files();

  it("finds the sources to check", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it("has the single source of truth", () => {
    expect(fs.existsSync(SOURCE_OF_TRUTH)).toBe(true);
    const src = fs.readFileSync(SOURCE_OF_TRUTH, "utf8");
    for (const v of ["public", "buyer_specific", "private_draft"]) {
      expect(src).toContain(`${v}: {`);
    }
  });

  it("has no second copy of the visibility label map", () => {
    const offenders: string[] = [];
    for (const file of all) {
      if (file === SOURCE_OF_TRUTH) continue;
      if (file.includes("__tests__")) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (OWN_MAP.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
      });
    }

    expect(
      offenders,
      `a second visibility vocabulary in ${offenders.length} place(s):\n  ${offenders.join("\n  ")}\n` +
        "Import PRODUCT_VISIBILITY, visibilityOf, visibilityChip or " +
        "visibilityIconClass from @/lib/product-visibility instead. The last " +
        "time these were written by hand, the storefront filter and the " +
        "product badge used the word Private for two different states.",
    ).toEqual([]);
  });
});
