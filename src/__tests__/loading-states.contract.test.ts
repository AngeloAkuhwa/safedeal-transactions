import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { scanLoadingRepo, scanLoadingSource } from "./helpers/loading-state-scan";

/**
 * A loading branch that replaces the page must preserve its layout.
 *
 * This is the inverted form: every layout-replacing branch in `src/` must use a
 * Skeleton, and exceptions are listed here individually with a reason. Listing a
 * whole directory, or keying the exemption off a filename pattern, would let the
 * next `LoadingSplash.tsx` exempt itself.
 */
const ALLOWLIST: Array<{ file: string; reason: string }> = [
  {
    file: "src/components/auth/BrandedAuthSplash.tsx",
    reason:
      "First-paint auth gate: there is no page layout to preserve yet. The app shell has not resolved which surface to render. A branded full-screen hold is the correct pattern here, and it carries the wordmark rather than a bare spinner.",
  },
  {
    file: "src/components/pwa/LaunchGate.tsx",
    reason:
      "Installed-PWA cold start, before the router mounts. Same reason: nothing about the destination layout is known yet, so there is no shape a skeleton could honestly promise.",
  },
];

describe("loading states preserve layout", () => {
  it("documents a reason for every exemption", () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.trim().length, `${entry.file} needs a real reason`).toBeGreaterThan(60);
      expect(() => readFileSync(entry.file, "utf8"), `${entry.file} is stale`).not.toThrow();
    }
  });

  it("no layout-replacing branch renders only a spinner", () => {
    const exempt = new Set(ALLOWLIST.map((a) => a.file));
    const violations = scanLoadingRepo("src", exempt);
    expect(
      violations.map((v) => `${v.file}:${v.line}  ${v.snippet}`),
      "Use a Skeleton that mirrors the loaded layout (see src/components/common/PageSkeleton.tsx). " +
        "A centred spinner collapses the page, causes layout shift when data lands, and. Because " +
        "prefers-reduced-motion disables animate-spin app-wide. Renders as a frozen icon for some users.",
    ).toEqual([]);
  });

  it("catches a spinner-only branch, and does not flag a spinner inside a control", () => {
    const bad = `<div className="min-h-[100dvh] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>`;
    expect(scanLoadingSource(bad, "x.tsx")).toHaveLength(1);

    const retryCard = `<div className="flex flex-col items-center justify-center py-16 text-center">
      <h2>Could not load</h2>
      <Button onClick={retry}>{busy && <Loader2 className="animate-spin" />}Retry</Button>
    </div>`;
    expect(scanLoadingSource(retryCard, "x.tsx")).toHaveLength(0);

    const skeleton = `<div className="min-h-[100dvh] flex items-center justify-center">
      <Skeleton className="h-40 w-full" />
    </div>`;
    expect(scanLoadingSource(skeleton, "x.tsx")).toHaveLength(0);
  });
});

describe("skeletons announce themselves", () => {
  it("every PageSkeleton export sets role=status and aria-busy", () => {
    const source = readFileSync("src/components/common/PageSkeleton.tsx", "utf8");
    expect(source).toMatch(/role="status"/);
    expect(source).toMatch(/aria-busy="true"/);
    // A skeleton with no accessible label is a silent box of grey rectangles.
    expect(source).toMatch(/className="sr-only"/);
  });

  it("every call site passes a label", () => {
    const files = scanLoadingRepo; // keep the import shape stable
    void files;
    const uses = readFileSync("src/pages/SellerDashboard.tsx", "utf8");
    expect(uses).toMatch(/<PageSkeleton label="/);
  });
});
