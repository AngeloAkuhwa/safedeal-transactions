import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertOctagon, AlertTriangle, BadgeCheck, CheckCircle2, Clock, PackageCheck,
  PackageX, Scale, ShieldAlert, Wallet, X, ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SellerAlert, AlertSeverity } from "@/services/seller-dashboard.service";

interface SellerAlertBannersProps {
  alerts: SellerAlert[];
  /** Maximum visible at once (defaults to 3). Set to alerts.length to show all (used in drawer). */
  maxVisible?: number;
  /** Optional: override icon/tone resolution e.g. for drawer compact mode */
  compact?: boolean;
}

type Tone = "destructive" | "amber" | "sky";

const baseToneByType: Record<string, Tone> = {
  payout_failed: "destructive",
  dispute_response_required: "amber",
  payout_account_required: "destructive",
  payout_account_unverified: "amber",
  delivery_proof_required: "amber",
  awaiting_seller_confirmation: "amber",
  identity_verification_required: "amber",
  low_stock_warning: "amber",
  out_of_stock_published: "sky",
  awaiting_release: "sky",
};

const iconByType: Record<string, typeof AlertTriangle> = {
  payout_failed: AlertOctagon,
  dispute_response_required: Scale,
  payout_account_required: Wallet,
  payout_account_unverified: ShieldAlert,
  delivery_proof_required: PackageCheck,
  awaiting_seller_confirmation: CheckCircle2,
  identity_verification_required: BadgeCheck,
  low_stock_warning: AlertTriangle,
  out_of_stock_published: PackageX,
  awaiting_release: Clock,
};

function resolveTone(alert: SellerAlert): Tone {
  // Critical severity always wins → destructive tokens.
  if (alert.severity === "critical") return "destructive";
  return baseToneByType[alert.type] ?? "amber";
}

const toneClasses: Record<Tone, {
  container: string;
  icon: string;
  title: string;
  body: string;
  primaryBtn: string;
  secondaryBtn: string;
  countBadge: string;
  dueChip: string;
}> = {
  destructive: {
    container: "bg-destructive/5 border-destructive/40",
    icon: "text-destructive",
    title: "text-foreground",
    body: "text-muted-foreground",
    primaryBtn: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    secondaryBtn: "border border-destructive/40 text-destructive hover:bg-destructive/10",
    countBadge: "bg-destructive text-destructive-foreground",
    dueChip: "bg-destructive/10 text-destructive border border-destructive/30",
  },
  amber: {
    container: "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-900 dark:text-amber-100",
    body: "text-amber-800/90 dark:text-amber-200/80",
    primaryBtn: "bg-amber-600 text-white hover:bg-amber-700",
    secondaryBtn: "border border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30",
    countBadge: "bg-amber-600 text-white",
    dueChip: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-100",
  },
  sky: {
    container: "bg-sky-50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-800",
    icon: "text-primary",
    title: "text-sky-900 dark:text-sky-100",
    body: "text-sky-800/90 dark:text-sky-200/80",
    primaryBtn: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondaryBtn: "border border-sky-300 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/30",
    countBadge: "bg-primary text-primary-foreground",
    dueChip: "bg-sky-100 text-sky-900 border border-sky-300 dark:bg-sky-900/40 dark:text-sky-100",
  },
};

const DISMISS_KEY_PREFIX = "safedeal:seller_alerts_dismissed:";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

function readDismissed(userId: string | null): Record<string, string> {
  if (!userId || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DISMISS_KEY_PREFIX + userId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeDismissed(userId: string | null, map: Record<string, string>) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY_PREFIX + userId, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function formatDueChip(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const dueAtRaw = metadata.due_at as string | undefined;
  if (!dueAtRaw) return null;
  const dueAt = new Date(dueAtRaw).getTime();
  if (Number.isNaN(dueAt)) return null;
  const diffMs = dueAt - Date.now();
  const absHours = Math.floor(Math.abs(diffMs) / 3_600_000);
  const absMins = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
  if (diffMs < 0) {
    return `Overdue by ${absHours}h`;
  }
  if (absHours <= 0) return `${absMins}m left`;
  return `${absHours}h ${absMins}m left`;
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

  // Re-tick once a minute so the countdown chip stays fresh while mounted.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const visible = useMemo(() => {
    const now = Date.now();
    const filtered = alerts.filter((a) => {
      if (a.blocking || !a.dismissible) return true;
      const ts = dismissed[a.type];
      if (!ts) return true;
      const t = new Date(ts).getTime();
      if (Number.isNaN(t)) return true;
      return now - t > DISMISS_TTL_MS;
    });
    return filtered.slice(0, maxVisible);
  }, [alerts, dismissed, maxVisible, tick]);

  if (visible.length === 0) return null;

  const handleDismiss = (type: string) => {
    const next = { ...dismissed, [type]: new Date().toISOString() };
    setDismissed(next);
    writeDismissed(userId, next);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {visible.map((alert) => {
        const tone = resolveTone(alert);
        const c = toneClasses[tone];
        const Icon = iconByType[alert.type] ?? AlertTriangle;
        const dueChip = formatDueChip(alert.metadata);
        return (
          <div
            key={`${alert.type}-${alert.priority}`}
            className={`flex flex-col gap-3 rounded-lg border-l-4 p-4 shadow-sm sm:flex-row sm:items-start ${c.container}`}
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5"
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
