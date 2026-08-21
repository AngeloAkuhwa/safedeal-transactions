import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import {
  Shield, Bell, LogOut, Menu, X,
  LayoutDashboard, ArrowLeftRight, Scale, BellRing, User, ShoppingBag, Lock,
  ShoppingCart, Heart,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { signOut, getSession } from "@/services/auth.service";
import { invalidateOldSessions } from "@/services/session.service";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import { getBuyerNotifications } from "@/services/notifications.service";
import { getCartItems } from "@/services/cart.service";

interface BuyerNavProps {
  buyerName: string;
  avatarUrl: string | null;
}

const navLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Marketplace", href: "/dashboard/marketplace", icon: ShoppingBag },
  { label: "Saved", href: "/dashboard/saved", icon: Heart },
  { label: "Transactions", href: "/dashboard/transactions", icon: ArrowLeftRight },
  { label: "Private Offers", href: "/dashboard/offers", icon: Lock },
  { label: "Disputes", href: "/dashboard/disputes", icon: Scale },
  { label: "Notifications", href: "/dashboard/notifications", icon: BellRing },
  { label: "Profile", href: "/dashboard/profile", icon: User },
];

export function BuyerNav({ buyerName, avatarUrl }: BuyerNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userId = useCurrentUserId();
  useRealtimeNotifications(userId);

  const { data: notifSummary } = useQuery({
    queryKey: ["notification-summary", userId],
    queryFn: async () => {
      const res = await getBuyerNotifications({ page: 1, page_size: 1 });
      return res.summary;
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
  const unreadTotal = notifSummary?.unread_count ?? 0;
  const badgeText = unreadTotal > 9 ? "9+" : String(unreadTotal);

  const { data: cartData } = useQuery({
    queryKey: ["buyer-cart"],
    queryFn: getCartItems,
    staleTime: 30_000,
    enabled: !!userId,
  });
  const cartCount = cartData?.count ?? 0;
  const cartBadgeText = cartCount > 9 ? "9+" : String(cartCount);
  // When add-to-cart is off the badge is hidden at zero (nothing to promote),
  // but the cart entry point itself always stays reachable so a buyer can
  // always open, view and remove their own saved items.
  const showCartBadge = cartCount > 0;
  const cartHint = `${cartCount} items in cart`;

  const handleLogout = async () => {
    try {
      const { data: { session } } = await getSession();
      if (session) {
        await invalidateOldSessions(session.user.id);
      }
      await signOut();
      toast.success("Signed out successfully");
      navigate("/");
    } catch {
      await signOut();
      navigate("/");
    }
  };

  const initials = buyerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-sticky border-b bg-card/80 backdrop-blur-md">
      <div className="sd-page flex h-14 items-center justify-between">
        {/* Logo */}
        {/* At 320px the wordmark and four 44px actions want 346px of a 320px
            line. The actions are all real targets, so the logo is what gives:
            a smaller wordmark below sm, and `min-w-0`/`truncate` as a floor so
            a longer brand can never push the actions off-screen again. */}
        <Link to="/" className="flex min-h-11 min-w-0 shrink items-center gap-2 transition-opacity hover:opacity-80">
          <Shield className="h-7 w-7 shrink-0 text-primary" />
          <span className="truncate text-lg font-bold text-foreground sm:text-xl">SafeDeal</span>
        </Link>

        {/*
          Desktop nav.

          `inline-flex min-h-11 items-center` because these were 20px tall
          boxes: "Saved" measured 42x20. This nav shows from md (768), and 768
          to 1024 is a tablet, so a finger was being asked to hit 20px. The
          render audit could not see it while it only ran phone widths, where
          this nav is hidden.

          Width needed the same treatment on the second pass: raising the
          height left "Saved" at 42x44 and "Profile" at 43x44, both still under
          44 across. The padding is paid for out of the gap rather than added
          on top, so the rhythm is unchanged: gap-4 is 16px between text edges,
          and gap-1 plus px-1.5 is 4 + 6 + 6, also 16. At lg, gap-6 is 24 and
          gap-3 plus px-1.5 is 12 + 6 + 6, also 24.

          `shrink-0`, and NOT `min-w-11`, which was the third pass. A flex item
          defaults to `min-width: auto`, and that is what had been stopping
          these from shrinking below their own text. Setting an explicit
          `min-w-11` replaced that floor with 44px, so the items became
          shrinkable and "Dashboard" squashed from 73px to 52px with the glyphs
          hanging out of the box. The audit caught it as glyph:1 at 834, which
          is the one check static analysis cannot do. Padding alone already
          clears 44 across for the narrowest label ("Saved" at 42 plus 12), so
          the minimum was never needed; not shrinking is.

          The header row is a fixed-height flex row, so the taller hit area
          sits inside it and centres. Nothing moves.
        */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-3 overflow-x-auto">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.href || 
              (link.href !== "/dashboard" && location.pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link to="/dashboard/cart" aria-label={cartHint}>
              <ShoppingCart className="h-5 w-5" />
              {showCartBadge && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
                  {cartBadgeText}
                </span>
              )}
            </Link>
          </Button>

          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link
              to="/dashboard/notifications"
              aria-label={`${unreadTotal} unread notifications`}
            >
              <Bell className="h-5 w-5" />
              {unreadTotal > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
                  {badgeText}
                </span>
              )}
            </Link>
          </Button>

          <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-border">
            <Avatar className="h-9 w-9">
              <AvatarImage src={avatarUrl ?? undefined} alt={buyerName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-foreground">{buyerName}</p>
              <p className="text-xs text-muted-foreground">Buyer</p>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={handleLogout} className="hidden sm:inline-flex">
            <LogOut className="h-4 w-4" />
          </Button>

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-card px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors min-h-11"
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-11"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </header>
  );
}
