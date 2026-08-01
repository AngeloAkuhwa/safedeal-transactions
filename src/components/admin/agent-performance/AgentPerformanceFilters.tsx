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
    (filters.search ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={filters.team} onValueChange={(v) => onChange({ team: v })}>
        <SelectTrigger className="h-9 w-[150px] bg-card/60" aria-label="Filter by team">
          <SelectValue placeholder="All Teams" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Teams</SelectItem>
          {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.range} onValueChange={(v) => onChange({ range: v as Filters["range"] })}>
        <SelectTrigger className="h-9 w-[150px] bg-card/60" aria-label="Filter by date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Last 7 Days</SelectItem>
          <SelectItem value="30d">Last 30 Days</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 bg-card/60">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
            {activeExtra > 0 && (
              <span className="ml-2 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {activeExtra}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-4 bg-popover">
          <div className="space-y-1.5">
            <Label className="text-xs">Search agent</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                value={filters.search}
                onChange={(e) => onChange({ search: e.target.value })}
                placeholder="Name or email"
                className="h-9 pl-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={filters.role} onValueChange={(v) => onChange({ role: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((r) => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Availability</Label>
            <Select value={filters.availability} onValueChange={(v) => onChange({ availability: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
            <Label className="text-xs">SLA state</Label>
            <Select value={filters.sla} onValueChange={(v) => onChange({ sla: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              className="h-9"
            />
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
            onClick={() => onChange({ ...DEFAULT_AGENT_FILTERS, range: filters.range, team: filters.team })}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset extra filters
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}