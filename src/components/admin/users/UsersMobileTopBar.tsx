import { Menu, Search, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  onOpenMenu: () => void;
  totalUsers: number;
  onSearchFocus?: () => void;
  onlineCount?: number;
  offlineCount?: number;
}

function compactTotal(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

export function UsersMobileTopBar({ onOpenMenu, totalUsers, onSearchFocus, onlineCount = 0, offlineCount = 0 }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-4 py-4 lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            className="w-11 h-11 flex items-center justify-center bg-slate-800 rounded-lg text-slate-300 active:scale-95 transition-transform"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Users</h2>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400 text-xs uppercase font-bold tracking-tight">
                {compactTotal(totalUsers)} Total · {onlineCount} on · {offlineCount} off
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSearchFocus?.()}
            className="w-11 h-11 flex items-center justify-center bg-slate-800 rounded-lg text-slate-300 active:scale-95"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => toast({ title: "Add User is coming soon." })}
            className="w-11 h-11 flex items-center justify-center bg-emerald-600 text-white rounded-lg shadow-lg shadow-emerald-900/20 active:scale-95"
            aria-label="Add user"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}