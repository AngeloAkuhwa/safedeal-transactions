import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Shield, Bell, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VendorStatusBanner } from "@/components/seller/VendorStatusBanner";
import { SELLER_NAV_LINKS, isSellerLinkActive } from "./links";
import { useSellerNavigation } from "./useSellerNavigation";

export interface SellerNavigationProps {
  sellerName: string;
  avatarUrl: string | null;
  /**
   * Only `identity_verified` may earn a verification claim. Omitted where the
   * caller does not know, which is honest rather than optimistic. The label
   * falls back to a plain one instead of implying an unproven state.
   */
  identityVerified?: boolean;
  /**
   * How the chrome is drawn. Same links, same behaviour, same tokens. The
   * difference is layout, not content.
   *
   * `header` is the app-wide default. `sidebar` is for the storefront's
   * product-management screens, which are dense enough to want the vertical
   * rail and the extra horizontal room a top bar would eat.
   */
  variant?: "header" | "sidebar";
}

/** The bell, with its unread count. Identical in both presentations. */
function NotificationsButton({
  unreadTotal,
  badgeText,
  onNavigate,
}: {
  unreadTotal: number;
  badgeText: string;
  onNavigate?: () => void;
}) {
  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link
        to="/seller/notifications"
        onClick={onNavigate}
        aria-label={`${unreadTotal} unread notifications and messages`}
      >
        <Bell className="h-5 w-5" />
        {unreadTotal > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
            {badgeText}
          </span>
        )}
      </Link>
    </Button>
  );
}

/** The wordmark. One mark, one token. See the note in SellerNavigation. */
function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5 min-h-11 transition-opacity hover:opacity-80"
    >
      <Shield className="h-5 w-5 text-primary-foreground" />
      <span className="text-lg font-bold text-foreground">SafeDeal</span>
    </Link>
  );
}

function SellerIdentity({
  sellerName,
  avatarUrl,
  initials,
  accountLabel,
}: {
  sellerName: string;
  avatarUrl: string | null;
  initials: string;
  accountLabel: string;
}) {
  return (
    <>
      <Avatar className="h-9 w-9">
        <AvatarImage src={avatarUrl ?? undefined} alt={sellerName} />
        <AvatarFallback className="bg-muted text-xs text-foreground">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{sellerName}</p>
        <p className="truncate text-xs text-muted-foreground">{accountLabel}</p>
      </div>
    </>
  );
}

/**
 * The seller's navigation, in one place.
 *
 * There were two: a sticky header on sixteen pages and a left sidebar on the
 * four storefront pages. They were not two skins over one component. They were
 * two components that had drifted, and the drift was not cosmetic:
 *
 *   - the sidebar's link list was missing Analytics and Private Offers, so from
 *     the storefront those sections had no route in the chrome at all;
 *   - only the header mounted the notification hooks, so on the storefront the
 *     unread count was never fetched and the realtime channel never opened;
 *   - only the header rendered VendorStatusBanner, so a seller whose account had
 *     been suspended saw no warning on precisely the screens where they would
 *     carry on listing products;
 *   - the sidebar's logo was `bg-gradient-to-br from-blue-500 to-indigo-600`
 *     with `text-white`, three raw colours outside the token system, so it did
 *     not follow the theme and could not follow a rebrand.
 *
 * All four are the same defect wearing different clothes: a second copy that
 * nobody updated. This component is the single copy. `variant` chooses how it
 * is drawn and changes nothing about what it contains.
 */
export function SellerNavigation({
  sellerName,
  avatarUrl,
  identityVerified,
  variant = "header",
}: SellerNavigationProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadTotal, badgeText, handleLogout, initials, accountLabel } = useSellerNavigation(
    sellerName,
    identityVerified,
  );

  if (variant === "sidebar") {
    const column = (onNavigate?: () => void) => (
      <div className="flex h-full flex-col border-r border-border bg-card">
        <div className="px-5 py-6">
          <Brand />
        </div>

        <VendorStatusBanner />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {SELLER_NAV_LINKS.filter((l) => !l.chromeOnly).map((link) => {
            const isActive = isSellerLinkActive(location.pathname, link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border border-primary/20 bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                  />
                )}
                <link.icon className="h-[18px] w-[18px]" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 px-3 pb-4">
          <div className="flex items-center gap-1 px-1">
            <NotificationsButton
              unreadTotal={unreadTotal}
              badgeText={badgeText}
              onNavigate={onNavigate}
            />
            <ThemeToggle />
          </div>

          <button
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <span>Sign Out</span>
          </button>

          <div className="mt-4 flex items-center gap-3 border-t border-border px-3 pt-4">
            <SellerIdentity
              sellerName={sellerName}
              avatarUrl={avatarUrl}
              initials={initials}
              accountLabel={accountLabel}
            />
          </div>
        </div>
      </div>
    );

    return (
      <>
        <aside className="hidden min-h-[100dvh] w-[260px] flex-shrink-0 lg:flex">{column()}</aside>

        {/* This normal-flow rail reserves the trigger's space on every seller
            screen; pages no longer copy fragile left-padding compensations. */}
        <div className="w-14 shrink-0 border-r border-border bg-card lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="sticky top-2 z-sticky m-1.5 border border-border bg-card/90"
            onClick={() => setMobileOpen(true)}
            aria-label="Open seller navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[260px] border-border bg-card p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {column(() => setMobileOpen(false))}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <header className="sticky top-0 z-sticky border-b border-border/80 bg-card/85 shadow-sm backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Brand />

        {/*
          The full nav starts at lg (1024), not md (768).

          Eight links plus the wordmark plus the theme toggle, bell, avatar and
          sign-out need more than 768px. At 834 the right-hand group was pushed
          past the edge and clipped: the render audit measured "Profile" losing
          30px and the identity block losing 231px. Below lg the same sheet the
          phone uses carries all eight links at 44px each, which is the honest
          affordance on a touch device anyway.

          This predates the navigation unification: the previous SellerNav
          showed the same eight links from md. It was invisible because the
          audit only ever ran 320 to 414, where this nav is hidden.
        */}
        <nav className="hidden items-center gap-1 lg:flex">
          {SELLER_NAV_LINKS.filter((l) => !l.chromeOnly).map((link) => {
            const isActive = isSellerLinkActive(location.pathname, link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/5 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationsButton unreadTotal={unreadTotal} badgeText={badgeText} />

          <div className="hidden items-center gap-2.5 border-l border-border pl-3 sm:flex">
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarUrl ?? undefined} alt={sellerName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {sellerName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{accountLabel}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Sign out"
            className="hidden sm:inline-flex"
          >
            <LogOut className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="space-y-1 border-t bg-card px-4 py-4 lg:hidden">
          {SELLER_NAV_LINKS.filter((l) => !l.chromeOnly).map((link) => {
            const isActive = isSellerLinkActive(location.pathname, link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/5 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
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
