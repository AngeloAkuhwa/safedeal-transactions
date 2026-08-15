import { Filter } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UsersFilters } from "./UsersFilters";
import type { UserDirectoryQuery } from "@/services/admin-users-directory.service";

interface Props {
  value: UserDirectoryQuery;
  search: string;
  onChange: (v: UserDirectoryQuery) => void;
  onSearchChange: (s: string) => void;
  onApply: () => void;
  onReset: () => void;
}

export function UsersAdvancedFiltersSheet(props: Props) {
  return (
    <div className="lg:hidden px-4 py-2 flex items-center justify-between">
      <h3 className="text-white font-bold text-sm uppercase tracking-wider">User Directory</h3>
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs font-semibold active:scale-95 min-h-11"
          >
            <Filter className="h-3.5 w-3.5" /> Filters
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="bg-slate-950 border-slate-800 text-slate-200 max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white">Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <UsersFilters {...props} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}