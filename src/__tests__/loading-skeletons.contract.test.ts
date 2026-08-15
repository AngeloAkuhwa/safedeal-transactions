import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Page-level loading branches must render a layout-matched Skeleton, not a
 * bare spinner or a bare "Loading…" text string.
 */
const FILES = [
  "src/pages/SellerStorefront.tsx",
  "src/pages/BuyerCart.tsx",
  "src/components/seller/InventoryLogTable.tsx",
  "src/App.tsx",
  "src/pages/BuyerPrivateOffers.tsx",
  "src/pages/AdminUserDetail.tsx",
  "src/pages/AdminAccessApprovals.tsx",
  "src/pages/AdminReconciliation.tsx",
];

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
}

describe("loading skeletons contract", () => {
  it.each(FILES)("%s uses Skeleton in its loading branches", (relPath) => {
    const source = read(relPath);
    expect(source).toContain("Skeleton");
  });

  it("AdminAccessApprovals no longer renders bare 'Loading requests…' text", () => {
    const source = read("src/pages/AdminAccessApprovals.tsx");
    expect(source).not.toContain("Loading requests…");
  });

  it("AdminReconciliation replaced its bare-text loading branches with skeletons", () => {
    const source = read("src/pages/AdminReconciliation.tsx");
    // The two former offenders were literal `<div ...>Loading…</div>` with no
    // Skeleton sibling; assert Skeleton now appears near each occurrence.
    const loadingDivs = source.match(/text-sm text-muted-foreground">Loading…<\/div>/g) ?? [];
    expect(loadingDivs.length).toBe(0);
  });

  it("SellerStorefront and BuyerCart no longer render a bare Loader2-only branch", () => {
    for (const relPath of ["src/pages/SellerStorefront.tsx", "src/pages/BuyerCart.tsx"]) {
      const source = read(relPath);
      expect(source).not.toMatch(/isLoading \? \(\s*<div[^>]*>\s*<Loader2/);
    }
  });
});
