import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { SellerAlert, AlertSeverity } from "@/services/seller-dashboard.service";
import {
  iconByType, resolveTone, toneClasses,
  readDismissed, writeDismissed, isDismissed, formatDueChip,
} from "./alertConfig";

interface SellerAlertsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerts: SellerAlert[];
  userId: string | null;
}

const SEVERITY_ORDER: { key: AlertSeverity; label: string }[] = [
  { key: "critical", label: "Critical" },
  { key: "action_required", label: "Action Required" },
  { key: "informational", label: "Informational" },
];

export function SellerAlertsDrawer({ open, onOpenChange, alerts, userId }: SellerAlertsDrawerProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => { setDismissed(readDismissed(userId)); }, [userId, open]);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const visibleBySeverity = useMemo(() => {
    const map: Record<AlertSeverity, SellerAlert[]> = {
      critical: [], action_required: [], informational: [],
    };
    for (const a of alerts) {
      if (isDismissed(a, dismissed)) continue;
      map[a.severity].push(a);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, dismissed, tick]);

  const handleDismiss = (type: string) => {
    const next = { ...dismissed, [type]: new Date().toISOString() };
    setDismissed(next);
    writeDismissed(userId, next);
  };

  const handleAction = (href: string) => {
    onOpenChange(false);
    setTimeout(() => navigate(href), 50);
  };

  const totalVisible = SEVERITY_ORDER.reduce((sum, g) => sum + visibleBySeverity[g.key].length, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>All alerts</SheetTitle>
          <SheetDescription>
            {totalVisible === 0
              ? "No outstanding alerts. Nice work."
              : `${totalVisible} ${totalVisible === 1 ? "alert" : "alerts"} grouped by priority.`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {SEVERITY_ORDER.map((group) => {
            const items = visibleBySeverity[group.key];
            if (items.length === 0) return null;
            const headerTone = group.key === "critical" ? "danger"
              : group.key === "action_required" ? "warning" : "info";
            return (
              <section key={group.key}>
                <h3 className={`mb-3 text-xs font-bold uppercase tracking-wide ${toneClasses[headerTone].groupHeader}`}>
                  {group.label} ({items.length})
                </h3>
                <div className="space-y-2">
                  {items.map((alert) => {
                    const tone = resolveTone(alert);
                    const c = toneClasses[tone];
                    const Icon = iconByType[alert.type] ?? AlertTriangle;
                    const dueChip = formatDueChip(alert.metadata);
                    return (
                      <div
                        key={`${alert.type}-${alert.priority}`}
                        className={`flex flex-col gap-2 rounded-lg border-l-4 p-3 ${c.container}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${c.icon}`} aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`text-sm font-semibold ${c.title}`}>{alert.title}</p>
                              {typeof alert.count === "number" && alert.count > 1 && (
                                <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${c.countBadge}`}>
                                  {alert.count}
                                </span>
                              )}
                              {dueChip && (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.dueChip}`}>
                                  {dueChip}
                                </span>
                              )}
                            </div>
                            <p className={`mt-0.5 text-xs ${c.body}`}>{alert.message}</p>
                          </div>
                          {alert.dismissible && !alert.blocking && (
                            <button
                              onClick={() => handleDismiss(alert.type)}
                              aria-label="Dismiss alert"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 relative before:absolute before:-inset-2 before:content-['']"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pl-6">
                          <button
                            onClick={() => handleAction(alert.action_href)}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${c.primaryBtn} min-h-11 min-w-11 justify-center`}
                          >
                            {alert.action_label}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                          {alert.secondary_action && (
                            <button
                              onClick={() => handleAction(alert.secondary_action!.href)}
                              className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${c.secondaryBtn} min-h-11 min-w-11 justify-center`}
                            >
                              {alert.secondary_action.label}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}