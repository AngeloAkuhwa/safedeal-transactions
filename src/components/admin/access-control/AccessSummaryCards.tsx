import { UserCog, UserCheck, UserX, ShieldAlert } from "lucide-react";
import type { AccessSummary } from "@/services/admin-access-control.service";

function Delta({ value, positiveIsGood = true }: { value: number; positiveIsGood?: boolean }) {
  const good = positiveIsGood ? value >= 0 : value <= 0;
  const sign = value > 0 ? "+" : "";
  const cls = good ? "text-emerald-400" : "text-red-400";
  return <span className={`text-xs font-semibold ${cls}`}>{sign}{value} this week</span>;
}

function Card({
  icon,
  iconTone,
  label,
  value,
  trailing,
  critical,
}: {
  icon: React.ReactNode;
  iconTone: string;
  label: string;
  value: number;
  trailing: React.ReactNode;
  critical?: boolean;
}) {
  return (
    <div className={`rounded-xl border ${critical ? "border-red-500/40 shadow-[0_0_0_1px_hsl(0_84%_60%/0.15)]" : "border-border"} bg-card p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${iconTone}`}>{icon}</div>
        {trailing}
      </div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

export function AccessSummaryCards({ summary }: { summary: AccessSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card
        icon={<UserCog className="h-5 w-5 text-blue-400" />}
        iconTone="bg-blue-500/15"
        label="Active Admins"
        value={summary.active_admins}
        trailing={<Delta value={summary.admins_delta_week} />}
      />
      <Card
        icon={<UserCheck className="h-5 w-5 text-emerald-400" />}
        iconTone="bg-emerald-500/15"
        label="Active Agents"
        value={summary.active_agents}
        trailing={<Delta value={summary.agents_delta_week} />}
      />
      <Card
        icon={<UserX className="h-5 w-5 text-red-400" />}
        iconTone="bg-red-500/15"
        label="Suspended Users"
        value={summary.suspended_users}
        trailing={<Delta value={summary.suspended_delta_week} positiveIsGood={false} />}
      />
      <Card
        critical
        icon={<ShieldAlert className="h-5 w-5 text-red-400" />}
        iconTone="bg-red-500/15"
        label="Full Access Users"
        value={summary.full_access_users}
        trailing={
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
            <ShieldAlert className="h-3 w-3" /> Critical
          </span>
        }
      />
    </div>
  );
}