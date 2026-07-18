import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Shield, Bell, LogOut, Menu, X,
  LayoutDashboard, ArrowLeftRight, Scale, BellRing, User, ShoppingBag, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { signOut, getSession } from "@/services/auth.service";
import { invalidateOldSessions } from "@/services/session.service";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";

interface BuyerNavProps {
  buyerName: string;
  avatarUrl: string | null;
}

const navLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Marketplace", href: "/dashboard/marketplace", icon: ShoppingBag },
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
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="sd-page flex h-14 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Shield className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">SafeDeal</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.href || 
              (link.href !== "/dashboard" && location.pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`text-sm font-medium transition-colors ${
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link to="/dashboard/notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
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
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </header>
  );
}
