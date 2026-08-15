import { Filter, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { AgentPerformanceFilters as Filters } from "@/services/agent-performance.service";
import { DEFAULT_AGENT_FILTERS } from "@/services/agent-performance.service";
import { WORKLOAD_STATUS_OPTIONS } from "./workloadStatus";

/** Lifecycle stages of an orchestration task (matches the database enum). */
const CASE_STAGE_OPTIONS = [
  "initial_review", "investigation", "evidence_collection", "buyer_response",
  "seller_response", "evidence_review", "resolution_preparation",
  "pending_approval", "final_decision", "completed",
] as const;

const humanizeStage = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function AgentPerformanceFilters({
  filters, onChange, teams, roles,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  teams: string[];
  roles: { key: string; name: string }[];
}) {
  const activeExtra =
    (filters.role !== "all" ? 1 : 0) +
    (filters.availability !== "all" ? 1 : 0) +
    (filters.sla !== "all" ? 1 : 0) +
    (filters.overdue_only ? 1 : 0) +
    (filters.min_active > 0 ? 1 : 0) +
    (filters.workload_status !== "all" ? 1 : 0) +
    (filters.case_priority !== "all" ? 1 : 0) +
    (filters.case_status !== "all" ? 1 : 0) +
    (filters.case_sla !== "all" ? 1 : 0) +
    (filters.case_stage !== "all" ? 1 : 0) +
    (filters.min_overdue > 0 ? 1 : 0) +
    (filters.score_min > 0 || filters.score_max < 100 ? 1 : 0) +
    (filters.search ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={filters.team} onValueChange={(v) => onChange({ team: v })}>
        <SelectTrigger className="h-11 w-[150px] bg-card/60" aria-label="Filter by team">
          <SelectValue placeholder="All Teams" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Teams</SelectItem>
          {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.range}
        disabled={filters.scope === "all_time"}
        onValueChange={(v) => onChange({ range: v as Filters["range"] })}
      >
        <SelectTrigger
          className="h-11 w-[150px] bg-card/60 disabled:opacity-50"
          aria-label="Filter by date range"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="7d">Last 7 Days</SelectItem>
          <SelectItem value="30d">Last 30 Days</SelectItem>
          <SelectItem value="month">Current Month</SelectItem>
          <SelectItem value="prev_month">Previous Month</SelectItem>
          <SelectItem value="quarter">Current Quarter</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      {filters.range === "custom" && filters.scope !== "all_time" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Custom range start date"
            className="h-11 w-[150px] bg-card/60"
            value={(filters.date_from ?? "").slice(0, 10)}
            onChange={(e) => onChange({ date_from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="Custom range end date"
            className="h-11 w-[150px] bg-card/60"
            value={(filters.date_to ?? "").slice(0, 10)}
            onChange={(e) => onChange({ date_to: e.target.value ? new Date(`${e.target.value}T23:59:59Z`).toISOString() : undefined })}
          />
        </div>
      )}

      {/* Scope: windowed stats vs lifetime stats. Drives cards, table, trend,
          exports and drawers together so no mixed reading is possible. */}
      <div
        role="group"
        aria-label="Statistics scope"
        className="inline-flex min-h-11 items-center rounded-lg border border-border/60 bg-card/60 p-0.5"
      >
        {(["range", "all_time"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filters.scope === s}
            onClick={() => onChange({ scope: s })}
            className={
              "rounded-md px-3 py-1 text-xs font-medium transition min-h-11 " +
              (filters.scope === s
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {s === "range" ? "In range" : "All time"}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-11 bg-card/60">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
            {activeExtra > 0 && (
              <span className="ml-2 rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                {activeExtra}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-[70vh] w-80 space-y-4 overflow-y-auto bg-popover">
          <div className="space-y-1.5">
            <Label className="text-xs">Search agent (name, user ID or email)</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                value={filters.search}
                onChange={(e) => onChange({ search: e.target.value })}
                placeholder="Name, user ID or email"
                className="h-11 pl-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={filters.role} onValueChange={(v) => onChange({ role: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((r) => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Availability</Label>
            <Select value={filters.availability} onValueChange={(v) => onChange({ availability: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="at_capacity">At Capacity</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Workload status</Label>
            <Select value={filters.workload_status} onValueChange={(v) => onChange({ workload_status: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any workload</SelectItem>
                {WORKLOAD_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Case priority</Label>
            <Select value={filters.case_priority} onValueChange={(v) => onChange({ case_priority: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Case status</Label>
            <Select value={filters.case_status} onValueChange={(v) => onChange({ case_status: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any case status</SelectItem>
                <SelectItem value="open">Open work</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Case SLA</Label>
            <Select value={filters.case_sla} onValueChange={(v) => onChange({ case_sla: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="on_track">On track</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Case stage</Label>
            <Select value={filters.case_stage} onValueChange={(v) => onChange({ case_stage: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any stage</SelectItem>
                {CASE_STAGE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{humanizeStage(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">SLA state</Label>
            <Select value={filters.sla} onValueChange={(v) => onChange({ sla: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="compliant">Fully compliant</SelectItem>
                <SelectItem value="breached">Has breaches</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Minimum active cases</Label>
            <Input
              type="number"
              min={0}
              value={filters.min_active}
              onChange={(e) => onChange({ min_active: Number(e.target.value) || 0 })}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Minimum overdue cases</Label>
            <Input
              type="number"
              min={0}
              value={filters.min_overdue}
              onChange={(e) => onChange({ min_overdue: Number(e.target.value) || 0 })}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Score range</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={100} aria-label="Minimum score"
                value={filters.score_min}
                onChange={(e) => onChange({ score_min: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                className="h-11"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="number" min={0} max={100} aria-label="Maximum score"
                value={filters.score_max}
                onChange={(e) => onChange({ score_max: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                className="h-11"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="overdue-only" className="text-xs">Overdue agents only</Label>
            <Switch
              id="overdue-only"
              checked={filters.overdue_only}
              onCheckedChange={(v) => onChange({ overdue_only: v })}
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => onChange({ ...DEFAULT_AGENT_FILTERS, range: filters.range, scope: filters.scope, team: filters.team })}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Clear Filters
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}