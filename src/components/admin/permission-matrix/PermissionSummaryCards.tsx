import { Users, KeyRound, ShieldAlert, UserCog, Clock3, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceSummary } from "@/services/permission-workspace.service";

interface Card {
  key: string;
  label: string;
  value: number | string;
  icon: any;
  tone: "primary" | "success" | "warning" | "info" | "muted";
  onClick?: () => void;
}

const TONE: Record<Card["tone"], string> = {
  primary: "text-primary bg-primary/10 ring-1 ring-inset ring-primary/20",
  success: "text-emerald-300 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20",
  warning: "text-amber-300 bg-amber-500/10 ring-1 ring-inset ring-amber-500/20",
  info: "text-sky-300 bg-sky-500/10 ring-1 ring-inset ring-sky-500/20",
  muted: "text-muted-foreground bg-muted/60 ring-1 ring-inset ring-border",
};

export function PermissionSummaryCards({
  summary,
  loading,
  onOpen,
}: {
  summary: WorkspaceSummary | null;
  loading: boolean;
  onOpen: (target: "role-matrix" | "feature-registry" | "user-overrides" | "pending-approvals" | "change-history", filter?: string) => void;
}) {
  const cards: Card[] = [
    { key: "roles", label: "Active Roles", value: summary?.active_roles ?? "—", icon: Users, tone: "primary", onClick: () => onOpen("role-matrix") },
    { key: "reg", label: "Registered Permissions", value: summary?.registered_permissions ?? "—", icon: KeyRound, tone: "info", onClick: () => onOpen("feature-registry") },
    { key: "priv", label: "Privileged Permissions", value: summary?.privileged_permissions ?? "—", icon: ShieldAlert, tone: "warning", onClick: () => onOpen("feature-registry", "privileged") },
    { key: "ov", label: "User Overrides", value: summary?.overrides_total ?? "—", icon: UserCog, tone: "info", onClick: () => onOpen("user-overrides") },
    { key: "pend", label: "Pending Approvals", value: summary?.pending_total ?? "—", icon: Clock3, tone: "warning", onClick: () => onOpen("pending-approvals") },
    { key: "recent", label: "Recent Changes (24h)", value: summary?.recent_changes_24h ?? "—", icon: History, tone: "muted", onClick: () => onOpen("change-history") },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onClick}
          className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 text-left backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset] transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card/80"
        >
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE[c.tone])}>
            <c.icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-0.5 text-2xl font-bold leading-none text-foreground">
              {loading ? <span className="inline-block h-5 w-8 animate-pulse rounded bg-muted" /> : c.value}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
