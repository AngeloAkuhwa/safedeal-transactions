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
  // One class list at a time: a greedy match would run across sibling
  // attributes and blame a card's `rounded-*` clip on a layout element.
  const lists = [
    ...source.matchAll(/className="([^"]*)"/g),
    ...source.matchAll(/className=\{`([^`]*)`\}/g),
  ].map((m) => m[1]);
  for (const attr of lists) {
    const tokens = attr.split(/\s+/).filter(Boolean);
    // Card decoration (rounded/aspect clipping) is not a scroll port.
    if (tokens.some((t) => /^(rounded|aspect)(-|$)/.test(t))) continue;
    // Desktop-only blocks (`hidden md:block`) never render under the tab bar.
    if (tokens.includes("hidden") && tokens.some((t) => /^(sm|md|lg):(block|table|flex|grid)$/.test(t))) continue;
    // Class lists built from an interpolated token cannot be resolved here.
    if (attr.includes("$")) continue;
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
