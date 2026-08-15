import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERFORMANCE_LEVELS, type AgentPerformanceFilters as Filters } from "@/services/agent-performance.service";

/**
 * Rankings-only controls. Team, role and date range come from the shared bar;
 * these narrow the leaderboard to comparable workloads.
 */
export function RankingsFilters({
  filters, onChange,
}: { filters: Filters; onChange: (patch: Partial<Filters>) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border/60 bg-background/50 p-3">
      <div className="space-y-1">
        <Label htmlFor="min-completed" className="text-xs text-muted-foreground">Minimum completed cases</Label>
        <Input
          id="min-completed"
          type="number"
          min={0}
          className="h-11 w-[160px] bg-card/60"
          value={filters.min_completed}
          onChange={(e) => onChange({ min_completed: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Performance level</Label>
        <Select value={filters.performance_level} onValueChange={(v) => onChange({ performance_level: v })}>
          <SelectTrigger className="h-11 w-[180px] bg-card/60" aria-label="Filter by performance level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFORMANCE_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 pb-2">
        <Switch
          id="hide-insufficient"
          checked={filters.hide_insufficient}
          onCheckedChange={(v) => onChange({ hide_insufficient: v })}
        />
        <Label htmlFor="hide-insufficient" className="text-xs text-muted-foreground">
          Hide agents below the minimum sample
        </Label>
      </div>
      <p className="ml-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
        Agents below the minimum completed cases are shown as “Insufficient Data” so a one-case
        agent is never compared against a large caseload.
      </p>
    </div>
  );
}
