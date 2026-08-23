import {
  ArrowLeftRight,
  Bell,
  Heart,
  LayoutDashboard,
  Lock,
  Scale,
  ShoppingBag,
  ShoppingCart,
  User,
  type LucideIcon,
} from "lucide-react";

export interface BuyerNavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Cart is chrome in the header (the icon button with the live count) and a
   * list row in the sidebar, so the header's text nav skips it rather than
   * showing the same destination twice on one bar.
   */
  header: boolean;
  /**
   * Profile is the sidebar's bottom "Settings" affordance, so its list skips
   * the row; the header shows it as an ordinary link.
   */
  sidebar: boolean;
  /** The one destination whose row carries the live cart count. */
  showCartBadge?: boolean;
  /**
   * Present on the five primary destinations, absent otherwise. The phone
   * tab bar renders exactly the entries that carry one, under this shorter
   * label, because a bottom bar has room for five words of one syllable and
   * "Transactions" is not one of them. The subset is data here rather than
   * a second list in the tab bar, which had already drifted onto its own
   * bell icon before the audit caught it.
   */
  tabLabel?: string;
}

/**
 * The buyer's destinations. One list, because there used to be two.
 *
 * The header (`BuyerNav`, fourteen dashboard pages) had nine of these. The
 * sidebar (`BuyerSidebar`, the six shopping pages: marketplace, cart, saved
 * and both checkouts) had seven, and was missing Private Offers entirely: a
 * buyer browsing the marketplace had no link to their own offers anywhere in
 * the chrome. The seller navigation drifted in exactly this way before #24
 * unified it, and the working agreement's rule 7 exists because a second
 * copy only has to be forgotten once.
 *
 * The two copies also disagreed on icons: Disputes was `Scale` in the header
 * and `AlertTriangle` in the sidebar, Notifications was `BellRing` and
 * `Bell`. One copy settles it: `Scale`, because a dispute is a neutral
 * process rather than a warning state, and plain `Bell`, because the ringing
 * variant implies unread and the badge already says that.
 */
export const BUYER_NAV_LINKS: readonly BuyerNavLink[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, header: true, sidebar: true, tabLabel: "Home" },
  { label: "Marketplace", href: "/dashboard/marketplace", icon: ShoppingBag, header: true, sidebar: true, tabLabel: "Market" },
  { label: "Cart", href: "/dashboard/cart", icon: ShoppingCart, header: false, sidebar: true, showCartBadge: true },
  { label: "Saved", href: "/dashboard/saved", icon: Heart, header: true, sidebar: true },
  { label: "Transactions", href: "/dashboard/transactions", icon: ArrowLeftRight, header: true, sidebar: true, tabLabel: "Deals" },
  { label: "Private Offers", href: "/dashboard/offers", icon: Lock, header: true, sidebar: true },
  { label: "Disputes", href: "/dashboard/disputes", icon: Scale, header: true, sidebar: true },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell, header: true, sidebar: true, tabLabel: "Alerts" },
  { label: "Profile", href: "/dashboard/profile", icon: User, header: true, sidebar: false, tabLabel: "Profile" },
] as const;

/**
 * Whether `pathname` is inside `href`. `/dashboard` matches only itself,
 * because every buyer route starts with it and a prefix test would light the
 * Dashboard entry on every page. Same rule, same reasoning, and the same
 * single-copy treatment as `isSellerLinkActive`.
 */
export function isBuyerLinkActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
