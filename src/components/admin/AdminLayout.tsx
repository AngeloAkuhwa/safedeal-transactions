import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { AdminMobileHeader } from "./AdminMobileHeader";
import { ReadingModeProvider } from "./ReadingModeContext";
import { AdminReadingModeControl } from "./AdminReadingModeControl";
import { AdminFooter } from "./AdminFooter";
import { TwoFactorEnrolmentBanner } from "@/components/security/TwoFactorEnrolmentBanner";
import { useAgentHeartbeat } from "@/hooks/useAgentHeartbeat";
import type { AdminDashboardResponse } from "@/services/admin-dashboard.service";

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  badges?: AdminDashboardResponse["sidebar_badges"];
  children: ReactNode;
  hideDefaultHeaders?: boolean;
  headerSlot?: ReactNode | ((opts: { onOpenMenu: () => void }) => ReactNode);
  mobileHeaderSlot?: ReactNode | ((opts: { onOpenMenu: () => void }) => ReactNode);
  fullBleed?: boolean;
  /**
   * When true, locks the shell to the viewport height and lets the page
   * manage its own scroll containers (used by workspaces like the
   * Admin Dispute Detail). Default false preserves normal page scrolling.
   */
  fullHeight?: boolean;
}

export function AdminLayout({
  title,
  subtitle,
  badges,
  children,
  hideDefaultHeaders,
  headerSlot,
  mobileHeaderSlot,
  fullBleed,
  fullHeight,
}: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  useAgentHeartbeat();

  return (
    <ReadingModeProvider>
    <div className={fullHeight ? "min-h-[100dvh] bg-background text-foreground lg:h-screen lg:overflow-hidden" : "min-h-[100dvh] bg-background text-foreground"}>
      <div className={fullHeight ? "flex min-h-[100dvh] lg:h-screen lg:overflow-hidden" : "flex min-h-[100dvh]"}>
        {/* Desktop sidebar */}
        <div className="hidden w-72 shrink-0 border-r border-border lg:block">
          <div className="sticky top-0 h-[100dvh] overflow-hidden">
            <AdminSidebar badges={badges} />
          </div>
        </div>

        {/* Mobile drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 border-border bg-card p-0 text-foreground"
          >
            <AdminSidebar badges={badges} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main column */}
        <div className={"flex min-w-0 flex-1 flex-col" + (fullHeight ? " lg:h-screen lg:min-h-0 lg:overflow-hidden" : "") }>
          {/* Mobile navigation rail. Rendered in normal flow (not `fixed`) so it
              reserves its own space and can never be pushed below the fold on
              screens that opt out of the default headers. */}
          {hideDefaultHeaders && !mobileHeaderSlot && typeof headerSlot !== "function" && (
            <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center border-b border-border bg-card/95 px-3 backdrop-blur lg:hidden">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="ml-3 truncate text-sm font-semibold text-foreground">{title}</span>
            </div>
          )}
          {mobileHeaderSlot
            ? typeof mobileHeaderSlot === "function"
              ? mobileHeaderSlot({ onOpenMenu: () => setMobileOpen(true) })
              : mobileHeaderSlot
            : !hideDefaultHeaders && (
                <AdminMobileHeader
                  onOpenMenu={() => setMobileOpen(true)}
                  title={title}
                  subtitle={subtitle}
                />
              )}
          {headerSlot
            ? typeof headerSlot === "function"
              ? headerSlot({ onOpenMenu: () => setMobileOpen(true) })
              : headerSlot
            : !hideDefaultHeaders && <AdminHeader title={title} subtitle={subtitle} />}
          {fullBleed ? (
            <main className={"flex-1 min-w-0 bg-background" + (fullHeight ? " lg:min-h-0 lg:overflow-hidden" : "")}>{children}</main>
          ) : (
            <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
              <div className="mx-auto w-full max-w-[1400px] space-y-5">
                <TwoFactorEnrolmentBanner />
                {children}
              </div>
            </main>
          )}
          {!fullHeight && <AdminFooter />}
        </div>
      </div>
      <AdminReadingModeControl variant="mobile-floater" />
      <AdminReadingModeControl variant="desktop-floater" />
    </div>
    </ReadingModeProvider>
  );
}