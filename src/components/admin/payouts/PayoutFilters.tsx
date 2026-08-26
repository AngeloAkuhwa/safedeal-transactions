import { Search } from "lucide-react";
import { ADMIN_FOCUS } from "@/components/admin/palette";

interface Props {
  search: string;
  onSearch: (v: string) => void;
}

export function PayoutFilters({ search, onSearch }: Props) {
  return (
    <div className="flex items-center gap-3 w-full lg:w-auto">
      <div className="relative flex-1 lg:flex-none">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search seller, transaction, payout ID..."
          className={`pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 ${ADMIN_FOCUS} w-full lg:w-80 text-sm min-h-11`}
        />
      </div>
    </div>
  );
}