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
const ROOTS = ["src/pages", "src/components/layout", "src/components/dashboard", "src/components/marketplace", "src/components/seller"];
const PAGES_ROOT = path.join(process.cwd(), "src/pages");

/** Every page file whose route the tab bar covers. */
function coveredPages(): string[] {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf-8");
  const files = new Set<string>();
  for (const m of app.matchAll(/path="([^"]+)"[^>]*element=\{<([A-Za-z0-9_]+)/g)) {
    const routePath = m[1].startsWith("/") ? m[1] : `/${m[1]}`;
    if (!getTabsForPath(routePath.replace(/:[^/]+/g, "x"))) continue;
    const file = path.join(PAGES_ROOT, `${m[2]}.tsx`);
    if (fs.existsSync(file)) files.add(path.relative(process.cwd(), file));
  }
  // Shell/chrome that renders on those same routes but lives outside
  // `src/pages` — previously invisible to this scan.
  for (const rel of ["src/components/layout/AdminLayout.tsx", "src/components/dashboard/BuyerNav.tsx", "src/components/marketplace/BuyerSidebar.tsx"]) {
    if (fs.existsSync(path.join(process.cwd(), rel))) files.add(rel);
  }
  return [...files].sort();
}

const LAYOUT_TRAP =
  /^(overflow-hidden|overflow-auto|overflow-y-auto|overflow-scroll|overflow-y-scroll|h-\[100dvh\]|h-\[100vh\]|h-dvh|h-screen|max-h-screen)$/;

export function occlusionOffenders(source: string): string[] {
  const offenders: string[] = [];
  // Resolve file-local class constants (`const glassPanel = "rounded-2xl …"`)
  // so a `${glassPanel} overflow-hidden` card is not misread as a scroll port.
  const consts = new Map<string, string>();
  for (const m of source.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g)) consts.set(m[1], m[2]);
  const expand = (s: string) => s.replace(/\$\{\s*([A-Za-z0-9_]+)\s*\}/g, (full, name) => consts.get(name) ?? full);
  // One class list at a time: a greedy match would run across sibling
  // attributes and blame a card's `rounded-*` clip on a layout element.
  // `cn(...)` and template literals are harvested too — the previous version
  // skipped both, which hid `BuyerSavedProducts` and `BuyerSidebar` entirely.
  const lists = [
    ...source.matchAll(/className="([^"]*)"/g),
    ...source.matchAll(/className=\{`([^`]*)`\}/g),
    ...source.matchAll(/className=\{cn\(([^]*?)\)\}/g),
  ].map((m) => m[1]);
  for (const raw of lists) {
    const attr = expand(raw);
    // Only string-literal segments carry classes; `${expr}` holes cannot be
    // resolved and are simply not scanned (documented gap, not a pass).
    const literal = attr.includes("$") || attr.includes('"')
      ? Array.from(attr.matchAll(/"([^"]*)"/g)).map((m) => m[1]).join(" ") || attr.replace(/\$\{[^}]*\}/g, " ")
      : attr;
    const tokens = literal.split(/\s+/).filter(Boolean);
    // Desktop-only blocks (`hidden md:block`) never render under the tab bar.
    if (tokens.includes("hidden") && tokens.some((t) => /^(sm|md|lg):(block|table|flex|grid)$/.test(t))) continue;
    // Card decoration is exempt per-token, not per-class-list: an
    // `overflow-hidden rounded-xl` on a flex layout element is still a trap
    // unless the *same* element is only a rounded/aspect clip container.
    // Decoration = a rounded/aspect clip that is not also a layout element
    // sized to fill the viewport or the flex column.
    const layoutSized = tokens.some((t) =>
      /^(h-full|flex-1|h-screen|h-dvh|h-\[100dvh\]|h-\[100vh\]|min-h-\[100dvh\]|min-h-screen)$/.test(t),
    );
    const decorative = tokens.some((t) => /^(rounded|aspect)(-|$)/.test(t)) && !layoutSized;
    for (const token of tokens) {
      if (!LAYOUT_TRAP.test(token)) continue;
      if (decorative && token === "overflow-hidden") continue;
      offenders.push(token);
    }
  }
  return offenders;
}

describe("mobile tab bar occlusion contract", () => {
  it("the tab bar reserves its own height with a spacer", () => {
    const bar = fs.readFileSync(path.join(process.cwd(), "src/components/layout/MobileTabBar.tsx"), "utf-8");
    // The entire anti-occlusion mechanism is one sibling spacer div. Without
    // it every covered page loses its bottom 56px, and no per-page assertion
    // in this file would notice.
    const spacer = bar.match(/<div\s+aria-hidden[^>]*style=\{\{\s*height:\s*"calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)"/);
    expect(spacer, "MobileTabBar must render an aria-hidden spacer sibling").toBeTruthy();
    const barHeight = bar.match(/className="mx-auto flex h-(\d+)/);
    expect(barHeight, "tab bar must declare a fixed height").toBeTruthy();
    // h-14 = 56px must equal the reserved space.
    expect(Number(spacer![1])).toBe(Number(barHeight![1]) * 4);
  });

  it.each(coveredPages())("%s never traps mobile scroll behind the tab bar", (relPath) => {
    const source = fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
    expect(occlusionOffenders(source), relPath).toEqual([]);
  });
});
