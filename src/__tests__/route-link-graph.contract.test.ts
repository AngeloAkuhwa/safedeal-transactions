/**
 * @vitest-environment node
 *
 * Every internal link target must resolve to a registered route.
 *
 * Found by an end to end audit rather than by a user, which was luck: the
 * "My transactions" button on BuyerPaymentSummary's pricing-unavailable
 * screen navigated to /buyer/transactions, a path that has never existed
 * (the buyer dashboard lives under /dashboard). So a buyer whose payment
 * was blocked, the moment they most need an exit, got a 404. Every gate
 * was green while it shipped, because nothing compared link targets to the
 * route table.
 *
 * This test rebuilds that comparison the way the audit did: collect every
 * string-literal target from navigate()/to=/href= across src/, normalise
 * template interpolations to a parameter segment, and require each one to
 * match a path registered in App.tsx. Dynamic targets built entirely at
 * runtime cannot be checked and are out of scope; the point is that a
 * typo'd literal can never ship again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Routes from App.tsx, as segment shapes where :params match anything. */
function routeShapes(): string[][] {
  const src = readFileSync("src/App.tsx", "utf8");
  const shapes: string[][] = [];
  for (const m of src.matchAll(/path="([^"]+)"/g)) {
    const p = m[1];
    if (p === "*") continue;
    shapes.push(
      p
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .map((seg) => (seg.startsWith(":") ? "*" : seg)),
    );
  }
  return shapes;
}

/**
 * String-literal internal targets. `${...}` interpolations become a wildcard
 * segment, so `/dashboard/transactions/${id}` checks the shape while the id
 * stays opaque. Hash and query are the page's business, not the router's.
 */
function linkTargets(files: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const patterns = [
    /navigate\(\s*[`"'](\/[^`"']*)[`"']/g,
    /to=\{?[`"'](\/[^`"']*)[`"']/g,
    /href=\{?[`"'](\/[^`"']*)[`"']/g,
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        let t = m[1].split("?")[0].split("#")[0];
        if (!t) continue;
        t = t.replace(/\$\{[^}]*\}/g, "*");
        // A target that is nothing but interpolation ("/${x}") says nothing.
        if (t.replace(/[/*]/g, "") === "") continue;
        const sites = found.get(t) ?? [];
        sites.push(file);
        found.set(t, sites);
      }
    }
  }
  return found;
}

function matches(target: string, shapes: string[][]): boolean {
  const segs = target
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((s) => (s.includes("*") ? "*" : s));
  return shapes.some(
    (shape) =>
      shape.length === segs.length &&
      shape.every((a, i) => a === "*" || segs[i] === "*" || a === segs[i]),
  );
}

describe("route link graph", () => {
  const shapes = routeShapes();
  const files = walk("src");
  const targets = linkTargets(files);

  it("sees the route table and the links", () => {
    // A parser that silently matches nothing is this suite's known failure
    // mode. Both ends of the comparison must be non-trivially populated.
    expect(shapes.length).toBeGreaterThan(50);
    expect(targets.size).toBeGreaterThan(50);
  });

  it("every literal link target resolves to a registered route", () => {
    const dead: string[] = [];
    for (const [t, sites] of targets) {
      if (!matches(t, shapes)) {
        dead.push(`${t}  (${[...new Set(sites)].join(", ")})`);
      }
    }
    expect(dead).toEqual([]);
  });
});
