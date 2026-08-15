import { Menu, ShieldCheck } from "lucide-react";
import { useAdminNav } from "./useAdminNav";
import { AdminReadingModeControl } from "./AdminReadingModeControl";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AdminMobileHeaderProps {
  onOpenMenu: () => void;
  title?: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export function AdminMobileHeader({ onOpenMenu, title, subtitle, rightSlot }: AdminMobileHeaderProps) {
  const { go } = useAdminNav();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-foreground/90 hover:bg-muted/70"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500">
              <ShieldCheck className="h-4 w-4 text-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight text-foreground">SafeDeal</div>
              <div className="text-[12px] uppercase tracking-wide text-muted-foreground">Admin Portal</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdminReadingModeControl variant="mobile-trigger" />
          <ThemeToggle />
        </div>
      </div>
      {(title || subtitle || rightSlot) && (
        <div className="flex items-end justify-between gap-3 px-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold leading-tight text-foreground truncate">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {rightSlot && <div className="flex shrink-0 items-center gap-2">{rightSlot}</div>}
        </div>
      )}
    </header>
  );
}