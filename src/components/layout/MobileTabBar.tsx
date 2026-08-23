import { Link, useLocation } from "react-router";
import { type LucideIcon } from "lucide-react";
import { BUYER_NAV_LINKS } from "@/components/buyer-navigation/links";
import { SELLER_NAV_LINKS } from "@/components/seller/navigation/links";

/**
 * Persistent mobile (<md) bottom tab bar for the authenticated buyer and
 * seller surfaces. Hidden on public pages and on the admin console, and
 * hidden entirely from md upwards so desktop layouts are untouched.
 */

interface Tab {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Derived, not declared: the five primary destinations are the entries of
// the canonical buyer list that carry a tabLabel. This bar had its own copy
// and it had already drifted onto its own bell icon before the audit caught
// it; deriving keeps hrefs and icons attached to the single source while the
// short labels stay explicit data there.
const BUYER_TABS: Tab[] = BUYER_NAV_LINKS.filter((l) => l.tabLabel).map((l) => ({
  label: l.tabLabel!,
  href: l.href,
  icon: l.icon,
}));

// Derived the same way as BUYER_TABS and for the same reason: this bar held
// the seller's five destinations as its own list, one file away from the
// buyer copy the audit caught in #47, and it had drifted the same way
// (BellRing where the single copy settles on Bell).
const SELLER_TABS: Tab[] = SELLER_NAV_LINKS.filter((l) => l.tabLabel).map((l) => ({
  label: l.tabLabel!,
  href: l.href,
  icon: l.icon,
}));

export function getTabsForPath(pathname: string): Tab[] | null {
  if (pathname.startsWith("/admin")) return null;
  if (pathname === "/seller" || pathname.startsWith("/seller/")) return SELLER_TABS;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return BUYER_TABS;
  return null;
}

function isActive(pathname: string, tab: Tab, tabs: Tab[]): boolean {
  if (pathname === tab.href) return true;
  const isRoot = tab.href === "/dashboard" || tab.href === "/seller";
  if (isRoot) {
    // Root tab stays active only when no more specific tab matches.
    return !tabs.some((other) => other !== tab && pathname.startsWith(other.href));
  }
  return pathname.startsWith(`${tab.href}/`);
}

export function MobileTabBar() {
  const { pathname } = useLocation();
  const tabs = getTabsForPath(pathname);
  if (!tabs) return null;

  return (
    <>
      {/* Spacer so page content is never hidden behind the fixed bar */}
      <div aria-hidden className="md:hidden" style={{ height: "calc(56px + env(safe-area-inset-bottom))" }} />
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-card/95 backdrop-blur-lg md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex h-14 max-w-lg items-stretch">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab, tabs);
            const Icon = tab.icon;
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  to={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`min-h-11 flex h-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span>{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
