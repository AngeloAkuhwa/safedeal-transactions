import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILTER_BAR_CLASS, humanize } from "./helpers";

export interface QueueFilters {
  priority: string;
  type: string;
  search: string;
  ageBucket: string;
  status: string;
  stage: string;
  sla: string;
  queue: string;
  team: string;
  requiredRole: string;
  amountMin: string;
  amountMax: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  perPage: number;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
  priority: "all", type: "all", search: "", ageBucket: "all",
  status: "all", stage: "all", sla: "all", queue: "all", team: "all", requiredRole: "all",
  amountMin: "", amountMax: "", dateFrom: "", dateTo: "",
  sortBy: "created_at", sortDir: "desc", page: 1, perPage: 25,
};

export const AGE_BUCKETS = [
  { value: "all", label: "Any age" },
  { value: "lt15", label: "< 15 min" },
  { value: "lt1h", label: "< 1 hour" },
  { value: "lt4h", label: "< 4 hours" },
  { value: "gte4h", label: "≥ 4 hours" },
];

function isDefault(f: QueueFilters): boolean {
  const d = DEFAULT_QUEUE_FILTERS;
  return (["priority","type","ageBucket","status","stage","sla","queue","team","requiredRole","amountMin","amountMax","dateFrom","dateTo"] as const)
    .every(k => (f as any)[k] === (d as any)[k]) && !f.search;
}

export function TaskQueueFilters({
  filters, onChange, types, stages = [], slaOptions = ["all","on_track","at_risk","overdue","breached"],
  queues = [], teams = [], requiredRoles = [],
}: {
  filters: QueueFilters;
  onChange: (patch: Partial<QueueFilters>) => void;
  types: string[];
  stages?: string[];
  slaOptions?: string[];
  queues?: string[];
  teams?: string[];
  requiredRoles?: string[];
}) {
  const reset = () => onChange({ ...DEFAULT_QUEUE_FILTERS, sortBy: filters.sortBy, sortDir: filters.sortDir, perPage: filters.perPage });
  return (
    <div className={FILTER_BAR_CLASS}>
      <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={e => onChange({ search: e.target.value, page: 1 })}
          placeholder="Search task code, title…"
          className="h-11 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <TinySelect label="Priority" value={filters.priority} onChange={v => onChange({ priority: v, page: 1 })}
        options={[["all","All Priorities"],["critical","Critical"],["high","High"],["medium","Medium"],["low","Low"]]} />
      <TinySelect label="Type" value={filters.type} onChange={v => onChange({ type: v, page: 1 })}
        options={[["all","All Types"], ...types.map(t => [t, humanize(t)] as [string, string])]} />
      <TinySelect label="Status" value={filters.status} onChange={v => onChange({ status: v, page: 1 })}
        options={[["all","Any status"],["unassigned","Unassigned"]]} />
      {stages.length > 0 && (
        <TinySelect label="Stage" value={filters.stage} onChange={v => onChange({ stage: v, page: 1 })}
          options={[["all","Any stage"], ...stages.map(s => [s, humanize(s)] as [string, string])]} />
      )}
      <TinySelect label="SLA" value={filters.sla} onChange={v => onChange({ sla: v, page: 1 })}
        options={slaOptions.map(v => [v, v === "all" ? "Any SLA" : humanize(v)] as [string, string])} />
      {queues.length > 0 && (
        <TinySelect label="Queue" value={filters.queue} onChange={v => onChange({ queue: v, page: 1 })}
          options={[["all","Any queue"], ...queues.map(q => [q, humanize(q)] as [string, string])]} />
      )}
      {teams.length > 0 && (
        <TinySelect label="Team" value={filters.team} onChange={v => onChange({ team: v, page: 1 })}
          options={[["all","Any team"], ...teams.map(t => [t, t] as [string, string])]} />
      )}
      {requiredRoles.length > 0 && (
        <TinySelect label="Required role" value={filters.requiredRole} onChange={v => onChange({ requiredRole: v, page: 1 })}
          options={[["all","Any role"], ...requiredRoles.map(r => [r, humanize(r)] as [string, string])]} />
      )}
      <TinySelect label="Age" value={filters.ageBucket} onChange={v => onChange({ ageBucket: v, page: 1 })}
        options={AGE_BUCKETS.map(b => [b.value, b.label] as [string, string])} />
      <Input type="number" placeholder="Min ₦" value={filters.amountMin}
        onChange={e => onChange({ amountMin: e.target.value, page: 1 })}
        className="h-11 w-[100px] bg-background/60 text-xs" />
      <Input type="number" placeholder="Max ₦" value={filters.amountMax}
        onChange={e => onChange({ amountMax: e.target.value, page: 1 })}
        className="h-11 w-[100px] bg-background/60 text-xs" />
      <Input type="date" value={filters.dateFrom}
        onChange={e => onChange({ dateFrom: e.target.value, page: 1 })}
        className="h-11 w-[140px] bg-background/60 text-xs" />
      <Input type="date" value={filters.dateTo}
        onChange={e => onChange({ dateTo: e.target.value, page: 1 })}
        className="h-11 w-[140px] bg-background/60 text-xs" />
      {!isDefault(filters) && (
        <Button variant="ghost" size="sm" onClick={reset} className="h-11 gap-1 text-xs">
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  );
}

function TinySelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 min-w-[130px] bg-background/60 text-xs"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Legacy client-side filter kept for callers that still hydrate the queue from
 * a full snapshot. Server-side filtering + pagination is the preferred path. */
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