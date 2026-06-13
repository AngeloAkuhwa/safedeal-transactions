import { Menu, Users as UsersIcon } from "lucide-react";

interface Props {
  onOpenMenu: () => void;
  totalUsers: number;
}

export function UsersMobileTopBar({ onOpenMenu, totalUsers }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onOpenMenu} className="p-2 rounded-lg bg-slate-800 text-slate-200" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h2 className="text-white text-sm font-semibold">User Directory</h2>
          <p className="text-slate-400 text-xs">{totalUsers.toLocaleString()} total</p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <UsersIcon className="h-4 w-4 text-emerald-400" />
        </div>
      </div>
    </header>
  );
}