import { useNavigate, useLocation } from "react-router-dom";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ShoppingBag,
  ArrowLeftRight,
  Heart,
  AlertTriangle,
  Bell,
  Settings,
  HelpCircle,
  Shield,
  Menu,
  X,
  ShoppingCart,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getCartItems } from "@/services/cart.service";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Marketplace", icon: ShoppingBag, path: "/dashboard/marketplace" },
  { label: "Cart", icon: ShoppingCart, path: "/dashboard/cart", showBadge: true },
  { label: "Saved", icon: Heart, path: "/dashboard/saved" },
  { label: "Transactions", icon: ArrowLeftRight, path: "/dashboard/transactions" },
  { label: "Disputes", icon: AlertTriangle, path: "/dashboard/disputes" },
  { label: "Notifications", icon: Bell, path: "/dashboard/notifications" },
];

export function BuyerSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { buyerName, avatarUrl } = useBuyerIdentity();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: cartData } = useQuery({
    queryKey: ["buyer-cart-count"],
    queryFn: getCartItems,
    staleTime: 30_000,
  });
  const cartCount = cartData?.count || 0;
  const initials = buyerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-sidebar-foreground">SafeDeal</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 mt-2">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-primary border-l-[3px] border-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {(item as any).showBadge && cartCount > 0 && (
                <Badge className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] bg-primary text-primary-foreground">
                  {cartCount}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="mt-auto space-y-3 px-3 pb-4">
        <button
          onClick={() => navigate("/dashboard/settings")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>

        {/* Profile card */}
        <div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3">
          <Avatar className="h-9 w-9">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {buyerName}
            </p>
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-primary" />
              <span className="text-[11px] text-primary">Verified Buyer</span>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-3 text-center">
          <HelpCircle className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-xs font-medium text-sidebar-foreground">Need Help?</p>
          <p className="text-[11px] text-muted-foreground">support@safedeal.com</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebar}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">{sidebar}</div>
    </>
  );
}
