import { useState, type ReactNode } from "react";
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
}: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ReadingModeProvider>
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
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
        <div className="flex min-w-0 flex-1 flex-col">
          {mobileHeaderSlot
            ? typeof mobileHeaderSlot === "function"
              ? mobileHeaderSlot({ onOpenMenu: () => setMobileOpen(true) })
              : mobileHeaderSlot
            : !hideDefaultHeaders && <AdminMobileHeader onOpenMenu={() => setMobileOpen(true)} />}
          {headerSlot
            ? headerSlot
            : !hideDefaultHeaders && <AdminHeader title={title} subtitle={subtitle} />}
          {fullBleed ? (
            <main className="flex-1 min-w-0 bg-background">{children}</main>
          ) : (
            <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
              <div className="mx-auto w-full max-w-[1400px] space-y-5">{children}</div>
            </main>
          )}
        </div>
      </div>
      <AdminReadingModeControl variant="mobile-floater" />
      <AdminReadingModeControl variant="desktop-floater" />
    </div>
    </ReadingModeProvider>
  );
}