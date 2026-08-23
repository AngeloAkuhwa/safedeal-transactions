import {
  AlertOctagon, AlertTriangle, BadgeCheck, CheckCircle2, Clock, PackageCheck,
  PackageX, Scale, ShieldAlert, Wallet,
} from "lucide-react";
import type { SellerAlert } from "@/services/seller-dashboard.service";

// The vocabulary matches src/lib/tone.ts: danger, warning, info. The old
// names were "destructive" | "amber" | "sky", and the last two were the
// tell: they named colours, not meanings, because each carried a complete
// hand-built palette that duplicated what the tone system already provides.
export type Tone = "danger" | "warning" | "info";

export const baseToneByType: Record<string, Tone> = {
  payout_failed: "danger",
  dispute_response_required: "warning",
  payout_account_required: "danger",
  payout_account_unverified: "warning",
  delivery_proof_required: "warning",
  awaiting_seller_confirmation: "warning",
  identity_verification_required: "warning",
  low_stock_warning: "warning",
  out_of_stock_published: "info",
  awaiting_release: "info",
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
  if (alert.severity === "critical") return "danger";
  return baseToneByType[alert.type] ?? "warning";
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
  danger: {
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
  // Colour carries the wash, the hairline, the glyph and the solid button;
  // the words run at full contrast. That is the tone system's contrast rule:
  // --warning is 38 92% 50% and cannot reach 4.5:1 as body text on the light
  // background, which is exactly why the old amber palette hand-tuned nine
  // light/dark pairs and still shipped amber-800/90 body copy.
  warning: {
    container: "bg-warning/10 border-warning/35",
    icon: "text-warning",
    title: "text-foreground",
    body: "text-muted-foreground",
    primaryBtn: "bg-warning text-warning-foreground hover:bg-warning/90",
    secondaryBtn: "border border-warning/40 text-foreground hover:bg-warning/10",
    countBadge: "bg-warning text-warning-foreground",
    dueChip: "bg-warning/10 text-foreground border border-warning/30",
    groupHeader: "text-foreground",
  },
  info: {
    container: "bg-primary/10 border-primary/35",
    icon: "text-primary",
    title: "text-foreground",
    body: "text-muted-foreground",
    primaryBtn: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondaryBtn: "border border-primary/35 text-foreground hover:bg-primary/10",
    countBadge: "bg-primary text-primary-foreground",
    dueChip: "bg-primary/10 text-foreground border border-primary/30",
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