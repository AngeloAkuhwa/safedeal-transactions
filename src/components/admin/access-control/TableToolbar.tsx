import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type SortBy = "name" | "role" | "status" | "access_level" | "last_active";
export type SortDir = "asc" | "desc";

interface Props {
  total: number;
  page: number;
  pageSize: number;
  sortBy: SortBy;
  sortDir: SortDir;
  onSort: (by: SortBy, dir: SortDir) => void;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}

const SORT_LABEL: Record<SortBy, string> = {
  name: "Name",
  role: "Role",
  status: "Status",
  access_level: "Access Level",
  last_active: "Last Active",
};

export function TableToolbar({ total, page, pageSize, sortBy, sortDir, onSort, onPage, onPageSize }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{from}–{to}</span> of{" "}
        <span className="font-semibold text-foreground">{total}</span> users
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <Select value={sortBy} onValueChange={(v) => onSort(v as SortBy, sortDir)}>
            <SelectTrigger className="h-11 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm" variant="outline"
            onClick={() => onSort(sortBy, sortDir === "asc" ? "desc" : "asc")}
            title={`Toggle ${sortDir === "asc" ? "descending" : "ascending"}`}
            aria-label="Toggle sort direction"
          >
            {sortDir === "asc" ? "Asc" : "Desc"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="h-11 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[64px] text-center text-xs text-muted-foreground">Page {page} / {pageCount}</span>
          <Button size="icon" variant="outline" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}