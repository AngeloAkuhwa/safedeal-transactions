import { Sliders } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TONE } from "./helpers";

const MODES = [
  { value: "manual",         label: "Manual Assignment", desc: "Senior admin picks the agent for every task" },
  { value: "round_robin",    label: "Round Robin",       desc: "Distribute tasks evenly across eligible agents" },
  { value: "least_loaded",   label: "Least Loaded",      desc: "Pick the agent with the most free capacity" },
  { value: "skill_based",    label: "Skill Based",       desc: "Match tasks to agents that hold required skills" },
  { value: "priority_based", label: "Priority Based",    desc: "Route critical/high to the senior pool first" },
];

export function AssignmentModeSelector({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const active = MODES.find(m => m.value === value);
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONE.primary}`}>
          <Sliders className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Assignment Mode</div>
          <div className="text-xs text-muted-foreground">How tasks are distributed</div>
        </div>
      </div>
      <Label className="sr-only">Assignment mode</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full bg-background/60"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MODES.map(m => (
            <SelectItem key={m.value} value={m.value}>
              <div className="flex flex-col">
                <span className="text-sm">{m.label}</span>
                <span className="text-[12px] text-muted-foreground">{m.desc}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {active?.desc ?? "Controls how new tasks are automatically assigned to available agents."}
      </p>
    </div>
  );
}