import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Any useQuery whose key is derived from a text search input must:
 *  1. use `placeholderData: keepPreviousData` (no jarring empty flash while typing), and
 *  2. keep the search input mounted in a single stable slot (no early return
 *     above it that unmounts it and steals focus).
 */
function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
}

describe("search stability contract", () => {
  it("BuyerTransactions query uses keepPreviousData", () => {
    const s = read("src/pages/BuyerTransactions.tsx");
    expect(s).toContain("placeholderData: keepPreviousData");
  });

  it("BuyerTransactions renders TransactionFilters in exactly one stable slot", () => {
    const s = read("src/pages/BuyerTransactions.tsx");
    const occurrences = s.match(/<TransactionFilters/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it("SellerTransactions query uses keepPreviousData", () => {
    const s = read("src/pages/SellerTransactions.tsx");
    expect(s).toContain("placeholderData: keepPreviousData");
  });

  it("PublicStorefront and SellerStorefront queries use keepPreviousData", () => {
    for (const relPath of ["src/pages/PublicStorefront.tsx", "src/pages/SellerStorefront.tsx"]) {
      const s = read(relPath);
      expect(s).toContain("placeholderData: keepPreviousData");
    }
  });

  it("SellerStorefront renders its search input outside the isLoading branch", () => {
    const s = read("src/pages/SellerStorefront.tsx");
    const loadingIdx = s.indexOf("{isLoading && (");
    const searchInputIdx = s.indexOf('placeholder="Search products..."');
    expect(searchInputIdx).toBeGreaterThan(-1);
    expect(loadingIdx).toBeGreaterThan(-1);
    expect(searchInputIdx).toBeLessThan(loadingIdx);
  });

  it("AgentPerformanceFilters debounces search before it reaches onChange", () => {
    const s = read("src/components/admin/agent-performance/AgentPerformanceFilters.tsx");
    expect(s).toMatch(/setTimeout\(\(\) => onChange\(\{ search: value \}\), 300\)/);
  });
});
