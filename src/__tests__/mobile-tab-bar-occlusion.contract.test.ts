import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getTabsForPath } from "@/components/layout/MobileTabBar";

/**
 * MobileTabBar is a `fixed bottom-0` bar shown on every /dashboard* and
 * /seller* route. Any page in that surface that establishes its own scroll
 * container (`overflow-hidden` / `overflow-auto` / `overflow-y-auto`) or pins a
 * viewport height (`h-[100dvh]` / `h-screen`) on a LAYOUT element hides the last
 * rows of content behind the bar on a phone. Those utilities must carry an
 * `lg:`/`md:` prefix so the mobile layout scrolls the document instead.
 *
 * Card decoration is exempt: an `overflow-hidden` paired with `rounded-*` or
 * `aspect-*` is clipping an image inside a card, not creating a scroll port.
 */
const ROOT = path.join(process.cwd(), "src/pages");

/** Every page file whose route the tab bar covers. */
function coveredPages(): string[] {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf-8");
  const files = new Set<string>();
  for (const m of app.matchAll(/path="([^"]+)"[^>]*element=\{<([A-Za-z0-9_]+)/g)) {
    const routePath = m[1].startsWith("/") ? m[1] : `/${m[1]}`;
    if (!getTabsForPath(routePath.replace(/:[^/]+/g, "x"))) continue;
    const file = path.join(ROOT, `${m[2]}.tsx`);
    if (fs.existsSync(file)) files.add(path.relative(process.cwd(), file));
  }
  // Lazy routes declare the component in a separate `lazy(() => import(...))`
  // map, so also include the pages the tab bar is known to cover directly.
  for (const extra of ["BuyerCart.tsx", "BuyerSavedProducts.tsx", "BuyerMarketplace.tsx", "SellerStorefront.tsx"]) {
    files.add(`src/pages/${extra}`);
  }
  return [...files].sort();
}

const LAYOUT_TRAP = /^(overflow-hidden|overflow-auto|overflow-y-auto|h-\[100dvh\]|h-screen)$/;

export function occlusionOffenders(source: string): string[] {
  const offenders: string[] = [];
  for (const attr of source.match(/className=\{?[^>]*?["'`][^"'`]*["'`]/g) ?? []) {
    const tokens = attr.replace(/[{}"'`]/g, "").split(/\s+/);
    const decorative = tokens.some((t) => /^(rounded|aspect)-/.test(t));
    if (decorative) continue;
    for (const token of tokens) if (LAYOUT_TRAP.test(token)) offenders.push(token);
  }
  return offenders;
}

describe("mobile tab bar occlusion contract", () => {
  it.each(coveredPages())("%s never traps mobile scroll behind the tab bar", (relPath) => {
    const source = fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
    expect(occlusionOffenders(source), relPath).toEqual([]);
  });
});
