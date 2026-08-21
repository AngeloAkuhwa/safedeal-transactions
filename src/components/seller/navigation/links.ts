import {
  LayoutDashboard,
  Store,
  ArrowLeftRight,
  BarChart3,
  Lock,
  Wallet,
  Scale,
  User,
  type LucideIcon,
} from "lucide-react";

export interface SellerNavLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * The seller's destinations. One list, because there used to be two.
 *
 * The header carried eight of these and the storefront sidebar carried five.
 * The sidebar was missing Analytics and Private Offers entirely, so from any of
 * the four storefront pages those two sections did not exist. Not "harder to reach":
 * there was no link to them in the chrome at all, and a seller who navigated to
 * their storefront had to know to go back to the dashboard first.
 *
 * That is the failure mode a duplicated list produces. Someone adds a
 * destination to the nav they are looking at, the other copy silently falls a
 * link behind, and nothing reports it. Both presentations now read this array,
 * so a link added here appears in both or in neither.
 */
export const SELLER_NAV_LINKS: readonly SellerNavLink[] = [
  { label: "Dashboard", href: "/seller", icon: LayoutDashboard },
  { label: "Storefront", href: "/seller/storefront", icon: Store },
  { label: "Transactions", href: "/seller/transactions", icon: ArrowLeftRight },
  { label: "Analytics", href: "/seller/analytics", icon: BarChart3 },
  { label: "Private Offers", href: "/seller/offers", icon: Lock },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
  { label: "Disputes", href: "/seller/disputes", icon: Scale },
  { label: "Profile", href: "/seller/profile", icon: User },
] as const;

/**
 * Whether `pathname` is inside `href`.
 *
 * `/seller` matches only itself. Every other route starts with it, so a
 * prefix test would light the Dashboard tab on every seller page. The two
 * previous implementations agreed on this and expressed it differently; it is
 * written once here so they cannot drift apart on it.
 */
export function isSellerLinkActive(pathname: string, href: string): boolean {
  if (href === "/seller") return pathname === "/seller";
  return pathname === href || pathname.startsWith(`${href}/`);
}
