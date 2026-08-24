import { AlertTriangle, Bell } from "lucide-react";
import { useState } from "react";
import type { AdminAlert } from "@/services/admin-dashboard.service";
import { formatRelative } from "./relative";

const SEVERITY_ROW: Record<AdminAlert["severity"], string> = {
  red: "bg-red-500/10 border-red-500/20 text-red-300",
  yellow: "bg-amber-500/10 border-amber-500/20 text-amber-200",
  blue: "bg-blue-500/10 border-blue-500/20 text-blue-300",
};

const ICONS: Record<AdminAlert["severity"], typeof AlertTriangle> = {
  red: AlertTriangle,
  yellow: Bell,
  blue: Bell,
};

interface Props { alerts: AdminAlert[] }

export function CriticalAlerts({ alerts: initial }: Props) {
  const [alerts, setAlerts] = useState(initial);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Critical Alerts</h3>
        <button
          type="button"
          onClick={() => setAlerts([])}
          className="text-xs text-muted-foreground hover:text-foreground min-h-11 inline-flex items-center"
        >
          Clear All
        </button>
      </div>
      {alerts.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          No active alerts. All clear.
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const Icon = ICONS[a.severity];
            return (
              <li
                key={a.id}
                className={`sd-fade-in-stagger sd-delay-1 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${SEVERITY_ROW[a.severity]}`}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.description}</div>
                  </div>
                </div>
                <div className="shrink-0 text-xs opacity-80">{formatRelative(a.at_iso)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}