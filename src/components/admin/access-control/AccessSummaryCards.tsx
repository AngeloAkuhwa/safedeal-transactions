import { UserCog, UserCheck, UserX, ShieldAlert, MailPlus, ClipboardCheck, Lock } from "lucide-react";
import type { AccessSummary, AccessFilter } from "@/services/admin-access-control.service";
import { ADMIN_TONE } from "@/components/admin/palette";

interface CardDef {
  filter: AccessFilter;
  label: string;
  value: number;
  icon: React.ReactNode;
  iconTone: string;
  critical?: boolean;
}

function Card({
  def, active, onSelect,
}: { def: CardDef; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`text-left rounded-xl border bg-card p-5 transition-all hover:border-primary/60 hover:shadow-sm ${
        active
          ? "border-primary/80 ring-2 ring-primary/40"
          : def.critical
            ? "border-red-500/40"
            : "border-border"
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${def.iconTone}`}>{def.icon}</div>
        {def.critical && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ADMIN_TONE.danger.text}`}>
            <ShieldAlert className="h-3 w-3" /> Critical
          </span>
        )}
      </div>
      <div className="text-xs font-medium text-muted-foreground">{def.label}</div>
      <div className="mt-1 text-3xl font-bold text-foreground">{def.value}</div>
    </button>
  );
}

export function AccessSummaryCards({
  summary, activeFilter, onSelect,
}: {
  summary: AccessSummary;
  activeFilter: AccessFilter;
  onSelect: (f: AccessFilter) => void;
}) {
  const cards: CardDef[] = [
    { filter: "admins", label: "Active Admins", value: summary.active_admins,
      icon: <UserCog className={`h-5 w-5 ${ADMIN_TONE.info.text}`} />, iconTone: "bg-blue-500/15" },
    { filter: "agents", label: "Active Agents", value: summary.active_agents,
      icon: <UserCheck className={`h-5 w-5 ${ADMIN_TONE.success.text}`} />, iconTone: "bg-emerald-500/15" },
    { filter: "invited", label: "Pending Invitations", value: summary.pending_invites,
      icon: <MailPlus className="h-5 w-5 text-indigo-400" />, iconTone: "bg-indigo-500/15" },
    { filter: "pending_approval", label: "Pending Access Approvals", value: summary.pending_approvals,
      icon: <ClipboardCheck className={`h-5 w-5 ${ADMIN_TONE.warning.text}`} />, iconTone: "bg-amber-500/15" },
    { filter: "suspended_or_locked", label: "Suspended or Locked Users", value: summary.suspended_or_locked,
      icon: <Lock className={`h-5 w-5 ${ADMIN_TONE.danger.text}`} />, iconTone: "bg-red-500/15" },
    { filter: "privileged", label: "Privileged Access Users", value: summary.privileged_users,
      icon: <ShieldAlert className={`h-5 w-5 ${ADMIN_TONE.danger.text}`} />, iconTone: "bg-red-500/15", critical: true },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <Card
          key={c.filter}
          def={c}
          active={activeFilter === c.filter}
          onSelect={() => onSelect(c.filter)}
        />
      ))}
    </div>
  );
}