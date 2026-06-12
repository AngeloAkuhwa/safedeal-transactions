import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  search: string;
  onSearch: (v: string) => void;
}

export function PayoutFilters({ search, onSearch }: Props) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
      <div className="relative flex-1 lg:flex-none">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search seller, transaction, payout ID..."
          className="pl-9 h-10 w-full lg:w-72 bg-muted/40 border-border"
        />
      </div>
      <Button size="sm" className="gap-2 shrink-0 h-10 bg-slate-800 hover:bg-slate-700 text-foreground border border-slate-700">
        <Filter className="h-4 w-4" />
        <span className="hidden sm:inline">Filters</span>
      </Button>
    </div>
  );
}