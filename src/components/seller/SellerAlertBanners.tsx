import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SellerAlert, AlertSeverity } from "@/services/seller-dashboard.service";
import {
  iconByType, resolveTone, toneClasses,
  readDismissed, writeDismissed, isDismissed, formatDueChip,
} from "./alertConfig";

interface SellerAlertBannersProps {
  alerts: SellerAlert[];
  /** Maximum visible at once (defaults to 3). Set to alerts.length to show all. */
  maxVisible?: number;
  compact?: boolean;
}

export function SellerAlertBanners({ alerts, maxVisible = 3, compact = false }: SellerAlertBannersProps) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      setDismissed(readDismissed(uid));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const visible = useMemo(() => {
    return alerts.filter((a) => !isDismissed(a, dismissed)).slice(0, maxVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, dismissed, maxVisible, tick]);

  if (visible.length === 0) return null;

  const handleDismiss = (type: string) => {
    const next = { ...dismissed, [type]: new Date().toISOString() };
    setDismissed(next);
    writeDismissed(userId, next);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {visible.map((alert, idx) => {
        const tone = resolveTone(alert);
        const c = toneClasses[tone];
        const Icon = iconByType[alert.type] ?? AlertTriangle;
        const dueChip = formatDueChip(alert.metadata);
        return (
          <div
            key={`${alert.type}-${alert.priority}`}
            className={`sd-alert sd-fade-in-stagger sd-delay-${Math.min(idx + 1, 6)} flex flex-col gap-2.5 rounded-lg border-l-4 px-4 py-3 shadow-sm sm:flex-row sm:items-start ${c.container}`}
            role="alert"
          >
            <Icon className={`h-5 w-5 shrink-0 ${c.icon}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-semibold ${c.title}`}>{alert.title || "Action needed"}</p>
                {typeof alert.count === "number" && alert.count > 1 && (
                  <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${c.countBadge}`}>
                    {alert.count}
                  </span>
                )}
                {dueChip && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${c.dueChip}`}>
                    {dueChip}
                  </span>
                )}
              </div>
              <p className={`mt-1 text-sm ${c.body}`}>{alert.message}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(alert.action_href)}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${c.primaryBtn}`}
              >
                {alert.action_label}
                <ArrowRight className="h-4 w-4" />
              </button>
              {alert.secondary_action && (
                <button
                  onClick={() => navigate(alert.secondary_action!.href)}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${c.secondaryBtn}`}
                >
                  {alert.secondary_action.label}
                </button>
              )}
              {alert.dismissible && !alert.blocking && (
                <button
                  onClick={() => handleDismiss(alert.type)}
                  aria-label="Dismiss alert"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { AlertSeverity };
