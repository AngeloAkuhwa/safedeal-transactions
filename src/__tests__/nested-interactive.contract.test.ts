import { describe, expect, it } from "vitest";
import { scanNestedRepo, scanNestedSource } from "./helpers/nested-interactive-scan";

/**
 * No interactive element may contain another one.
 *
 * This repo produced the defect three separate ways in one week, so it is a
 * class worth a guard rather than three fixes:
 *
 *  1. `PublicStorefront` wrapped `<ProductCard>` in a `<Link>`; the card later
 *     grew a stretched `<button>`, which gave two tab stops per card AND left
 *     that button dead, because the page never passed it an `onClick`.
 *  2. `SellerAnalytics` wrapped each of six KPI cards in a `<Link>` with an
 *     info `<button>` inside — twelve tab stops for six cards.
 *  3. Dispute evidence thumbnails were a `<button>` with a download `<a>` in it.
 */
const ALLOWLIST: Array<{ file: string; reason: string }> = [];

describe("no nested interactive content", () => {
  it("documents a reason for every exemption", () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.trim().length, `${entry.file} needs a real reason`).toBeGreaterThan(60);
    }
  });

  it("no control is rendered inside another control", () => {
    const exempt = new Set(ALLOWLIST.map((a) => a.file));
    const violations = scanNestedRepo("src", exempt);
    expect(
      violations.map((v) => `${v.file}:${v.line}  <${v.outer}> contains a control`),
      "Use the stretched-link pattern: keep the container a plain positioned element, " +
        "stretch one real control over it with `after:absolute after:inset-0`, and put " +
        "sibling controls above it on a higher z tier.",
    ).toEqual([]);
  });

  it("catches each nesting shape, and does not fire on lookalikes", () => {
    expect(scanNestedSource(`<Link to="/x"><button>Info</button></Link>`, "x.tsx")).toHaveLength(1);
    expect(scanNestedSource(`<button><a href="/f">Download</a></button>`, "x.tsx")).toHaveLength(1);
    expect(scanNestedSource(`<a href="/x"><span role="button">Go</span></a>`, "x.tsx")).toHaveLength(1);

    // A member-expression component is not an anchor. `\b` alone matched this,
    // which is the false positive that made an earlier scanner useless.
    expect(scanNestedSource(`<button><a.icon className="h-4 w-4" /><span>Run</span></button>`, "x.tsx")).toHaveLength(0);
    expect(scanNestedSource(`<button><article>text</article></button>`, "x.tsx")).toHaveLength(0);

    // Radix `asChild` merges props onto the child rather than rendering a wrapper.
    expect(scanNestedSource(`<Link asChild><button>Go</button></Link>`, "x.tsx")).toHaveLength(0);

    // The correct shape must pass.
    expect(
      scanNestedSource(
        `<div className="relative"><button className="absolute inset-0" /><a href="/f" className="z-sticky">Download</a></div>`,
        "x.tsx",
      ),
    ).toHaveLength(0);
  });
});
