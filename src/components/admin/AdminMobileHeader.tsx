import { Menu, ShieldCheck, Download } from "lucide-react";
import { useAdminNav } from "./useAdminNav";
import { AdminReadingModeControl } from "./AdminReadingModeControl";

interface AdminMobileHeaderProps {
  onOpenMenu: () => void;
}

export function AdminMobileHeader({ onOpenMenu }: AdminMobileHeaderProps) {
  const { go } = useAdminNav();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight text-white">SafeDeal</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Admin Portal</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdminReadingModeControl variant="mobile-trigger" />
          <button
          type="button"
          onClick={() => go("/admin/exports", "Exports")}
          aria-label="Export"
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
        >
          <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}