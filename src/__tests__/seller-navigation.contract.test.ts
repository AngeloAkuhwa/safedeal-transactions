/**
 * The seller has one navigation, not two.
 *
 * There used to be two components: a sticky header on sixteen pages and a left
 * sidebar on the four storefront pages. Nobody intended them to differ. They
 * differed anyway, because a second copy only has to be forgotten once:
 *
 *   - the sidebar's link list was two entries short (Analytics, Private
 *     Offers), so those sections had no route in the chrome of any storefront
 *     page;
 *   - only the header mounted the notification hooks, so on the storefront the
 *     unread count was never fetched and the realtime channel never opened;
 *   - only the header rendered VendorStatusBanner, so a suspended seller saw no
 *     warning on the screens where they would keep listing products;
 *   - the sidebar's logo used raw Tailwind colours that could not follow the
 *     theme.
 *
 * None of that is visible in a diff that adds a link to one file. It is visible
 * here.
 *
 * These are source-level assertions on purpose. Rendering the chrome needs a
 * router and a query client, and a test that heavy tends to get skipped when it
 * breaks; this one has nothing to mock and cannot go quiet.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

const NAV_DIR = "src/components/seller/navigation";
const LINKS = path.join(ROOT, NAV_DIR, "links.ts");
const COMPONENT = path.join(ROOT, NAV_DIR, "SellerNavigation.tsx");
const HEADER_WRAPPER = path.join(ROOT, "src/components/seller/SellerNav.tsx");
const SIDEBAR_WRAPPER = path.join(ROOT, "src/components/storefront/SellerStorefrontSidebar.tsx");

const read = (p: string) => fs.readFileSync(p, "utf8");

/** Every .ts/.tsx under src/, so a reintroduced copy cannot hide in a new folder. */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("seller navigation is defined once", () => {
  it("keeps the canonical link list where both presentations read it", () => {
    expect(fs.existsSync(LINKS), `${NAV_DIR}/links.ts is the single source of truth`).toBe(true);
    const src = read(LINKS);
    for (const href of [
      "/seller",
      "/seller/storefront",
      "/seller/transactions",
      "/seller/analytics",
      "/seller/offers",
      "/seller/payouts",
      "/seller/disputes",
      "/seller/profile",
    ]) {
      expect(src, `${href} missing from SELLER_NAV_LINKS`).toContain(`"${href}"`);
    }
  });

  it("has no second seller link list anywhere in src/", () => {
    // The shape that started this: an array literal of seller routes with
    // labels, declared outside the canonical module. Matching on two adjacent
    // seller hrefs inside one declaration is enough to spot a copy without
    // flagging a page that merely links somewhere.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = path.relative(ROOT, file);
      if (rel.startsWith(NAV_DIR)) continue;
      if (rel.includes("__tests__")) continue;

      const src = read(file);
      // Any const/let array, not only ones named *nav*. The first version
      // matched on the name and missed SELLER_TABS in MobileTabBar for
      // exactly that reason: a copy does not have to call itself a nav to
      // be one, and it had already drifted onto its own bell icon.
      const declarations = src.matchAll(/(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*\[([\s\S]*?)\]/g);
      for (const m of declarations) {
        // Content lists are allowed to point at seller routes: the dashboard
        // declares quick-action cards and metric tiles whose entries carry a
        // description or a value and whose hrefs are deep links with query
        // strings. A navigation copy is bare destinations: label plus a
        // plain seller path. Count only plain paths, and skip declarations
        // that are visibly content rather than chrome.
        if (/\b(?:description|value)\s*:/.test(m[1])) continue;
        const hrefs = [...m[1].matchAll(/["'`](\/seller[^"'`?]*)["'`]/g)].map((h) => h[1]);
        if (hrefs.length >= 2) offenders.push(`${rel} declares ${hrefs.length} seller links`);
      }
    }
    expect(
      offenders,
      `a second seller nav list has appeared:\n  ${offenders.join("\n  ")}\n` +
        `Import SELLER_NAV_LINKS from ${NAV_DIR}/links instead. Two lists is how ` +
        "Analytics and Private Offers went missing from the storefront chrome.",
    ).toEqual([]);
  });

  it("routes both wrappers through the shared component", () => {
    for (const [label, file] of [
      ["SellerNav", HEADER_WRAPPER],
      ["SellerStorefrontSidebar", SIDEBAR_WRAPPER],
    ] as const) {
      const src = read(file);
      expect(src, `${label} must delegate to SellerNavigation`).toContain("SellerNavigation");
      expect(
        /SELLER_NAV_LINKS|navLinks\s*=/.test(src),
        `${label} must not carry its own link list`,
      ).toBe(false);
    }
  });

  it("gives both presentations notifications and the suspension banner", () => {
    const src = read(COMPONENT);
    // Both branches read from one component, so counting the shared pieces is
    // enough: if either were dropped from a branch, the symbol would still be
    // present, which is why the sidebar branch is checked for its own mount.
    expect(src).toContain("VendorStatusBanner");
    expect(src).toContain("NotificationsButton");

    const sidebarBranch = src.slice(src.indexOf('variant === "sidebar"'), src.indexOf("return (\n    <header"));
    expect(sidebarBranch, "the sidebar must render the suspension banner").toContain(
      "<VendorStatusBanner />",
    );
    expect(sidebarBranch, "the sidebar must render the notifications button").toContain(
      "<NotificationsButton",
    );
  });
});

describe("seller navigation stays inside the colour system", () => {
  it("uses no raw colour utilities", () => {
    // The sidebar logo was a blue-to-indigo gradient with white glyph text.
    // Raw colours do not follow the theme and cannot follow a rebrand, and the
    // chrome is the worst place to keep one.
    //
    // Comments are stripped first. The prose above and below names the classes
    // it is warning about, and a guard that fires on its own explanation is a
    // guard people delete.
    const raw =
      /\b(?:bg|text|border|from|to|via|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:bg|text|border)-white\b|\b(?:bg|text|border)-black\b/g;

    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    for (const file of [COMPONENT, LINKS, HEADER_WRAPPER, SIDEBAR_WRAPPER]) {
      const hits = [...stripComments(read(file)).matchAll(raw)].map((m) => m[0]);
      expect(
        hits,
        `${path.relative(ROOT, file)} uses raw colours: ${hits.join(", ")}. ` +
          "Use the semantic tokens (primary, muted, destructive, warning, success) " +
          "so the chrome follows the theme.",
      ).toEqual([]);
    }
  });
});
