import {
  AlertOctagon, AlertTriangle, BadgeCheck, CheckCircle2, Clock, PackageCheck,
  PackageX, Scale, ShieldAlert, Wallet,
} from "lucide-react";
import type { SellerAlert } from "@/services/seller-dashboard.service";

export type Tone = "destructive" | "amber" | "sky";

export const baseToneByType: Record<string, Tone> = {
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

export const iconByType: Record<string, typeof AlertTriangle> = {
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

export function resolveTone(alert: SellerAlert): Tone {
  if (alert.severity === "critical") return "destructive";
  return baseToneByType[alert.type] ?? "amber";
}

export const toneClasses: Record<Tone, {
  container: string;
  icon: string;
  title: string;
  body: string;
  primaryBtn: string;
  secondaryBtn: string;
  countBadge: string;
  dueChip: string;
  groupHeader: string;
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
    groupHeader: "text-destructive",
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
    groupHeader: "text-amber-700 dark:text-amber-300",
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
    groupHeader: "text-primary",
  },
};

export const DISMISS_KEY_PREFIX = "safedeal:seller_alerts_dismissed:";
export const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

export function readDismissed(userId: string | null): Record<string, string> {
  if (!userId || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DISMISS_KEY_PREFIX + userId);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function writeDismissed(userId: string | null, map: Record<string, string>) {
  if (!userId || typeof window === "undefined") return;
  try { localStorage.setItem(DISMISS_KEY_PREFIX + userId, JSON.stringify(map)); }
  catch { /* ignore */ }
}

export function isDismissed(alert: SellerAlert, dismissed: Record<string, string>): boolean {
  if (alert.blocking || !alert.dismissible) return false;
  const ts = dismissed[alert.type];
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= DISMISS_TTL_MS;
}

export function formatDueChip(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const dueAtRaw = metadata.due_at as string | undefined;
  if (!dueAtRaw) return null;
  const dueAt = new Date(dueAtRaw).getTime();
  if (Number.isNaN(dueAt)) return null;
  const diffMs = dueAt - Date.now();
  const absHours = Math.floor(Math.abs(diffMs) / 3_600_000);
  const absMins = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
  if (diffMs < 0) return `Overdue by ${absHours}h`;
  if (absHours <= 0) return `${absMins}m left`;
  return `${absHours}h ${absMins}m left`;
}