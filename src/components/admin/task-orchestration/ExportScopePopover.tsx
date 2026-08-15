import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ExportScope =
  | "queue" | "live" | "assignment_history" | "agent_load" | "automation_rules";

const SCOPES: { value: ExportScope; label: string; desc: string }[] = [
  { value: "queue",              label: "Task queue (CSV)",         desc: "Current unassigned queue with current filters" },
  { value: "live",               label: "Live progression (CSV)",   desc: "Assigned + in-progress work" },
  { value: "assignment_history", label: "Assignment history (CSV)", desc: "Reassign / rebalance / manual events" },
  { value: "agent_load",         label: "Agent load (CSV)",         desc: "Roster with capacity, overdue, resolved-today" },
  { value: "automation_rules",   label: "Automation rules (CSV)",   desc: "Rules + version history" },
];

export function ExportScopePopover({
  onExport, canPii, canFinancial, disabled, busy,
}: {
  onExport: (opts: { scope: ExportScope; includePii: boolean; includeFinancial: boolean }) => Promise<void> | void;
  canPii: boolean;
  canFinancial: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [includePii, setIncludePii] = useState(false);
  const [includeFinancial, setIncludeFinancial] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export report
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Export scope</div>
        <div className="space-y-1">
          {SCOPES.map((s) => (
            <button key={s.value}
              type="button"
              onClick={async () => {
                setOpen(false);
                await onExport({ scope: s.value, includePii, includeFinancial });
              }}
              className="w-full rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:border-border/60 hover:bg-muted/40 min-h-11">
              <div className="font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
          <div className="flex items-center gap-2">
            <Checkbox id="pii" checked={includePii} disabled={!canPii}
              onCheckedChange={(v) => setIncludePii(!!v)} />
            <Label htmlFor="pii" className="text-xs">
              Include buyer/seller identifiers {canPii ? "" : "(needs data.export.pii)"}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="fin" checked={includeFinancial} disabled={!canFinancial}
              onCheckedChange={(v) => setIncludeFinancial(!!v)} />
            <Label htmlFor="fin" className="text-xs">
              Include amount / currency {canFinancial ? "" : "(needs data.export.financial)"}
            </Label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}