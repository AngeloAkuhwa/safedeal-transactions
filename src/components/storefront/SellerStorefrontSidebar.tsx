import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  Shield, LayoutDashboard, Store, ArrowLeftRight, Wallet, Scale, Settings, LogOut, Menu,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { signOut, getSession } from "@/services/auth.service";
import { invalidateOldSessions } from "@/services/session.service";
import { toast } from "@/components/ui/sonner";
import { sellerVerificationClaim } from "@/lib/trust/trust-claims";

interface SellerStorefrontSidebarProps {
  sellerName: string;
  avatarUrl: string | null;
  /** Only `identity_verified` may earn a verification claim. */
  identityVerified: boolean;
}

const navLinks = [
  { label: "Dashboard", href: "/seller", icon: LayoutDashboard },
  { label: "Storefront", href: "/seller/storefront", icon: Store },
  { label: "Transactions", href: "/seller/transactions", icon: ArrowLeftRight },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
  { label: "Disputes", href: "/seller/disputes", icon: Scale },
];

function getVerificationLabel(identityVerified: boolean) {
  return sellerVerificationClaim({ identityVerified }) ?? "Standard account";
}

function SidebarInner({ sellerName, avatarUrl, identityVerified, onNavigate }: SellerStorefrontSidebarProps & { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  const initials = sellerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    try {
      const { data: { session } } = await getSession();
      if (session) await invalidateOldSessions(session.user.id);
      await signOut();
      toast.success("Signed out successfully");
      navigate("/");
    } catch {
      await signOut();
      navigate("/");
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Logo */}
      <div className="px-5 py-6">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground">SafeDeal</span>
        </Link>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 space-y-1">
        {navLinks.map((link) => {
          const isActive = link.href === "/seller"
            ? location.pathname === "/seller"
            : location.pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              to={link.href}
              onClick={onNavigate}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/10 border border-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary" />
              )}
              <link.icon className="h-4.5 w-4.5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-1">
        <Link
          to="/seller/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <Settings className="h-4.5 w-4.5" />
          <span>Settings</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-all"
        >
          <LogOut className="h-4.5 w-4.5" />
          <span>Sign Out</span>
        </button>

        {/* Seller profile */}
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-3 px-3">
          <Avatar className="h-9 w-9 ring-2 ring-border">
            <AvatarImage src={avatarUrl ?? undefined} alt={sellerName} />
            <AvatarFallback className="bg-muted text-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{sellerName}</p>
            <p className="text-xs text-muted-foreground">{getVerificationLabel(identityVerified)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SellerStorefrontSidebar(props: SellerStorefrontSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[260px] min-h-[100dvh] flex-shrink-0">
        <SidebarInner {...props} />
      </aside>

      {/* This normal-flow rail reserves the trigger's space on every seller
          screen; pages no longer copy fragile left-padding compensations. */}
      <div className="w-14 shrink-0 border-r border-border bg-card lg:hidden">
        <Button variant="ghost" size="icon" className="sticky top-2 z-50 m-1.5 border border-border bg-card/90" onClick={() => setMobileOpen(true)} aria-label="Open seller navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[260px] p-0 bg-card border-border">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarInner {...props} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
