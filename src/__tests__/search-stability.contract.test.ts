import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Repo-wide audit (the previous version only knew about eight hand-listed
 * files, so any NEW search screen shipped un-debounced and unnoticed).
 *
 * Rule: if a `useQuery` key contains a state variable that a text input
 * writes to, that screen must
 *  1. debounce the value before it reaches the query key, and
 *  2. pass `placeholderData: keepPreviousData` so the list never blanks.
 */
const SRC = path.join(process.cwd(), "src");

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "test") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/** State setters wired directly to a text input's onChange in this file. */
function searchSetters(source: string): string[] {
  const setters = new Set<string>();
  for (const m of source.matchAll(/onChange=\{\(e\)\s*=>\s*set([A-Za-z0-9_]+)\(e\.target\.value\)/g)) {
    setters.add(m[1]);
  }
  return [...setters]
    .map((n) => n[0].toLowerCase() + n.slice(1))
    .filter((n) => /search|query|term|^q$/i.test(n));
}

/** Query keys declared in this file, as raw key-array text. */
function queryKeys(source: string): string[] {
  return [...source.matchAll(/queryKey:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
}

export function searchStabilityViolations(source: string): string[] {
  const problems: string[] = [];
  const vars = searchSetters(source);
  if (vars.length === 0) return problems;
  for (const v of vars) {
    const usedInKey = queryKeys(source).some((k) => new RegExp(`\\b${v}\\b`).test(k));
    if (!usedInKey) continue; // value never reaches a query key. Nothing to debounce
    problems.push(`\`${v}\` reaches a query key undebounced`);
  }
  if (problems.length && !source.includes("placeholderData: keepPreviousData")) {
    problems.push("missing placeholderData: keepPreviousData");
  }
  return problems;
}

describe("search stability contract", () => {
  it("no screen feeds a raw text input straight into a query key", () => {
    const violations: string[] = [];
    for (const f of walk(SRC)) {
      const found = searchStabilityViolations(fs.readFileSync(f, "utf-8"));
      if (found.length) violations.push(`${path.relative(process.cwd(), f)}: ${found.join("; ")}`);
    }
    expect(violations).toEqual([]);
  });

  it("every screen with a debounced search also keeps previous data", () => {
    const violations: string[] = [];
    for (const f of walk(SRC)) {
      const s = fs.readFileSync(f, "utf-8");
      if (!/setDebounced[A-Za-z0-9_]*\(/.test(s)) continue;
      if (!s.includes("useQuery")) continue;
      if (!s.includes("placeholderData: keepPreviousData")) {
        violations.push(path.relative(process.cwd(), f));
      }
    }
    expect(violations).toEqual([]);
  });

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

  it("audited admin list screens keep previous data across query-key changes", () => {
    for (const relPath of [
      "src/pages/AdminFlaggedUsers.tsx",
      "src/pages/AdminAccessControl.tsx",
      "src/pages/AdminEscrow.tsx",
    ]) {
      expect(read(relPath), relPath).toContain("placeholderData: keepPreviousData");
    }
  });

  it("AdminAccessControl debounces its directory search", () => {
    const s = read("src/pages/AdminAccessControl.tsx");
    expect(s).toContain("setDebouncedQ(q), 300");
    expect(s).not.toMatch(/\bq: q\.trim\(\)/);
  });

  it("AdminPayouts debounces search before the list loader depends on it", () => {
    const s = read("src/pages/AdminPayouts.tsx");
    expect(s).toContain("setDebouncedSearch(search), 300");
    expect(s).toContain("search: debouncedSearch || undefined");
    expect(s).toContain("[tab, debouncedSearch, page, filters]");
  });
});
