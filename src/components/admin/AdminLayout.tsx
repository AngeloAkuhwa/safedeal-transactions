import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { AdminMobileHeader } from "./AdminMobileHeader";
import { ReadingModeProvider } from "./ReadingModeContext";
import { AdminReadingModeControl } from "./AdminReadingModeControl";
import type { AdminDashboardResponse } from "@/services/admin-dashboard.service";

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  badges?: AdminDashboardResponse["sidebar_badges"];
  children: ReactNode;
  hideDefaultHeaders?: boolean;
  headerSlot?: ReactNode;
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

  return (
    <ReadingModeProvider>
    <div className={fullHeight ? "min-h-screen bg-background text-foreground xl:h-screen xl:overflow-hidden" : "min-h-screen bg-background text-foreground"}>
      <div className={fullHeight ? "flex min-h-screen xl:h-screen xl:overflow-hidden" : "flex min-h-screen"}>
        {/* Desktop sidebar */}
        <div className="hidden w-72 shrink-0 border-r border-border lg:block">
          <div className="sticky top-0 h-screen overflow-hidden">
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
        <div className={"flex min-w-0 flex-1 flex-col" + (fullHeight ? " xl:h-screen xl:min-h-0 xl:overflow-hidden" : "") }>
          {mobileHeaderSlot
            ? typeof mobileHeaderSlot === "function"
              ? mobileHeaderSlot({ onOpenMenu: () => setMobileOpen(true) })
              : mobileHeaderSlot
            : !hideDefaultHeaders && <AdminMobileHeader onOpenMenu={() => setMobileOpen(true)} />}
          {headerSlot
            ? headerSlot
            : !hideDefaultHeaders && <AdminHeader title={title} subtitle={subtitle} />}
          {fullBleed ? (
            <main className={"flex-1 min-w-0 bg-background" + (fullHeight ? " xl:min-h-0 xl:overflow-hidden" : "")}>{children}</main>
          ) : (
            <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
              <div className="mx-auto w-full max-w-[1400px] space-y-5">{children}</div>
            </main>
          )}
        </div>
      </div>
      {hideDefaultHeaders && !mobileHeaderSlot && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="fixed left-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur hover:bg-muted lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <AdminReadingModeControl variant="mobile-floater" />
      <AdminReadingModeControl variant="desktop-floater" />
    </div>
    </ReadingModeProvider>
  );
}