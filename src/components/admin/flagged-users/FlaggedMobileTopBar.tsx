import { Menu, Flag } from "lucide-react";

interface Props {
  onOpenMenu: () => void;
  activeFlags: number;
}

export function FlaggedMobileTopBar({ onOpenMenu, activeFlags }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 px-4 py-4 lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="w-11 h-11 flex items-center justify-center bg-slate-800 rounded-lg text-slate-300">
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight flex items-center gap-2">
              <Flag className="h-4 w-4 text-red-400" /> Flagged Users
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex items-center gap-1 text-xs text-red-400 font-bold uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {activeFlags.toLocaleString()} Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}