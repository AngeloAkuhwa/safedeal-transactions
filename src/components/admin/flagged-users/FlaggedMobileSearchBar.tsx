import { ADMIN_FOCUS, ADMIN_GROUND } from "@/components/admin/palette";
import { Search, SlidersHorizontal } from "lucide-react";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  onApply: () => void;
  onOpenFilters: () => void;
}

export function FlaggedMobileSearchBar({ search, onSearchChange, onApply, onOpenFilters }: Props) {
  return (
    <div className="lg:hidden space-y-3">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onApply()}
          placeholder="Search users or IDs..."
          className={`w-full ${ADMIN_GROUND.panel} border rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 ${ADMIN_FOCUS}`}
        />
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        className="w-full bg-slate-800 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <SlidersHorizontal className="h-4 w-4" /> Advanced Filters
      </button>
    </div>
  );
}