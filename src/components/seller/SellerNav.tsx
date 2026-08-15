import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import {
  Shield, Bell, LogOut, Menu, X,
  LayoutDashboard, ArrowLeftRight, Wallet, Scale, User, Store, Lock, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { signOut, getSession } from "@/services/auth.service";
import { invalidateOldSessions } from "@/services/session.service";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSellerUnreadCounts } from "@/hooks/useSellerUnreadCounts";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import { VendorStatusBanner } from "./VendorStatusBanner";

interface SellerNavProps {
  sellerName: string;
  avatarUrl: string | null;
}

const navLinks = [
  { label: "Dashboard", href: "/seller", icon: LayoutDashboard },
  { label: "Storefront", href: "/seller/storefront", icon: Store },
  { label: "Transactions", href: "/seller/transactions", icon: ArrowLeftRight },
  { label: "Analytics", href: "/seller/analytics", icon: BarChart3 },
  { label: "Private Offers", href: "/seller/offers", icon: Lock },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
  { label: "Disputes", href: "/seller/disputes", icon: Scale },
  { label: "Profile", href: "/seller/profile", icon: User },
];

export function SellerNav({ sellerName, avatarUrl }: SellerNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { total: unreadTotal } = useSellerUnreadCounts();
  const badgeText = unreadTotal > 9 ? "9+" : String(unreadTotal);
  const userId = useCurrentUserId();
  useRealtimeNotifications(userId);

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

  const initials = sellerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-card/85 backdrop-blur-lg shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">SafeDeal</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.href ||
              (link.href !== "/seller" && location.pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-primary font-semibold bg-primary/5 min-h-11 inline-flex items-center"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link
              to="/seller/notifications"
              aria-label={`${unreadTotal} unread notifications and messages`}
            >
              <Bell className="h-5 w-5" />
              {unreadTotal > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {badgeText}
                </span>
              )}
            </Link>
          </Button>

          <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-border">
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarUrl ?? undefined} alt={sellerName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-foreground leading-tight">{sellerName}</p>
              <p className="text-xs text-success">Seller Account</p>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={handleLogout} className="hidden sm:inline-flex">
            <LogOut className="h-4 w-4" />
          </Button>

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
      <VendorStatusBanner />
    </header>
  );
}
