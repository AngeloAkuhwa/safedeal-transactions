import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILTER_BAR_CLASS, humanize } from "./helpers";

export interface QueueFilters {
  priority: string;
  type: string;
  search: string;
  ageBucket: string;
}

export const AGE_BUCKETS = [
  { value: "all", label: "Any age" },
  { value: "lt15", label: "< 15 min" },
  { value: "lt1h", label: "< 1 hour" },
  { value: "lt4h", label: "< 4 hours" },
  { value: "gte4h", label: "≥ 4 hours" },
];

export function TaskQueueFilters({
  filters, onChange, types,
}: {
  filters: QueueFilters;
  onChange: (patch: Partial<QueueFilters>) => void;
  types: string[];
}) {
  return (
    <div className={FILTER_BAR_CLASS}>
      <div className="flex flex-1 min-w-[180px] items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          placeholder="Search task, dispute…"
          className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <Select value={filters.priority} onValueChange={v => onChange({ priority: v })}>
        <SelectTrigger className="h-9 w-[140px] bg-background/60 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.type} onValueChange={v => onChange({ type: v })}>
        <SelectTrigger className="h-9 w-[160px] bg-background/60 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {types.map(t => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.ageBucket} onValueChange={v => onChange({ ageBucket: v })}>
        <SelectTrigger className="h-9 w-[130px] bg-background/60 text-xs"><SelectValue placeholder="Age" /></SelectTrigger>
        <SelectContent>
          {AGE_BUCKETS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function filterQueue<T extends { priority: string; type: string; created_at: string; task_code: string; dispute_id: string | null; title?: string | null }>(
  rows: T[], f: QueueFilters,
): T[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(r => {
    if (f.priority !== "all" && r.priority !== f.priority) return false;
    if (f.type !== "all" && r.type !== f.type) return false;
    if (q) {
      const hay = `${r.task_code} ${r.dispute_id ?? ""} ${r.title ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.ageBucket !== "all") {
      const ageMin = (Date.now() - new Date(r.created_at).getTime()) / 60000;
      if (f.ageBucket === "lt15" && !(ageMin < 15)) return false;
      if (f.ageBucket === "lt1h" && !(ageMin < 60)) return false;
      if (f.ageBucket === "lt4h" && !(ageMin < 240)) return false;
      if (f.ageBucket === "gte4h" && !(ageMin >= 240)) return false;
    }
    return true;
  });
}