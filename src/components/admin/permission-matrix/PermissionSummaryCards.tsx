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
  primary: "text-primary bg-primary/10",
  success: "text-emerald-400 bg-emerald-500/10",
  warning: "text-amber-400 bg-amber-500/10",
  info: "text-sky-400 bg-sky-500/10",
  muted: "text-muted-foreground bg-muted",
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
          className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-card/80"
        >
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE[c.tone])}>
            <c.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="mt-0.5 text-xl font-bold text-foreground">
              {loading ? <span className="inline-block h-5 w-8 animate-pulse rounded bg-muted" /> : c.value}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
