import { useNavigate, useLocation } from "react-router";
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
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getCartItems } from "@/services/cart.service";
import { supportLink } from "@/lib/support/support-copy";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [collapsed, setCollapsed] = useState(false);

  const { data: cartData } = useQuery({
    queryKey: ["buyer-cart"],
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

  const sidebarContent = (isCollapsed: boolean) => (
    <div
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        isCollapsed ? "w-[68px]" : "w-64"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-3 py-5">
        <div className={cn("flex items-center gap-2", isCollapsed && "justify-center w-full")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">SafeDeal</span>
          )}
        </div>
        {/* Desktop collapse toggle — hidden on mobile */}
        {!isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex h-7 w-7 shrink-0 relative before:absolute before:-inset-2 before:content-['']"
            onClick={() => setCollapsed(true)}
          >
            <ChevronsLeft className="h-4 w-4 text-sidebar-foreground/60" />
          </Button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {isCollapsed && (
        <div className="hidden lg:flex justify-center pb-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 relative before:absolute before:-inset-2 before:content-['']"
            onClick={() => setCollapsed(false)}
          >
            <ChevronsRight className="h-4 w-4 text-sidebar-foreground/60" />
          </Button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 mt-2">
        <TooltipProvider delayDuration={0}>
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            const button = (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-11",
                  isCollapsed && "justify-center px-0",
                  active
                    ? "bg-sidebar-accent text-primary border-l-[3px] border-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && item.label}
                {(item as any).showBadge && cartCount > 0 && (
                  isCollapsed ? (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  ) : (
                    <Badge className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] bg-primary text-primary-foreground">
                      {cartCount}
                    </Badge>
                  )
                )}
              </button>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <div className="relative">{button}</div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {item.label}
                    {(item as any).showBadge && cartCount > 0 && ` (${cartCount})`}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return button;
          })}
        </TooltipProvider>
      </nav>

      {/* Bottom */}
      <div className="mt-auto space-y-3 px-2 pb-4">
        <TooltipProvider delayDuration={0}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate("/dashboard/profile")}
                  className="flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 min-h-11"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Settings</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => navigate("/dashboard/profile")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 min-h-11"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          )}
        </TooltipProvider>

        {/* Profile card */}
        {isCollapsed ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <Avatar className="h-9 w-9">
                    {avatarUrl && <AvatarImage src={avatarUrl} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">{buyerName}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
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
            </div>
          </div>
        )}

        {/* Support */}
        {!isCollapsed && (
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-3 text-center">
            <HelpCircle className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
            <p className="text-xs font-medium text-sidebar-foreground">Need Help?</p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-[11px]"
              onClick={() => navigate(supportLink())}
            >
              Message support
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Normal-flow mobile rail reserves its own space instead of forcing every
          buyer page to compensate for a fixed, overlapping trigger. */}
      <div className="w-14 shrink-0 border-r border-sidebar-border bg-sidebar lg:hidden">
        <Button variant="ghost" size="icon" className="sticky top-2 z-50 m-1.5" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle buyer navigation">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar — always expanded */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(false)}
      </div>

      {/* Desktop sidebar — collapsible */}
      <div className="hidden lg:block shrink-0">{sidebarContent(collapsed)}</div>
    </>
  );
}
