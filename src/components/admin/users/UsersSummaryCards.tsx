import { Users, UserCheck, Flag, UserPlus, IdCard, Mail } from "lucide-react";
import { ADMIN_TONE } from "@/components/admin/palette";
import type { UserDirectorySummary } from "@/services/admin-users-directory.service";

interface Props { summary: UserDirectorySummary }

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

function StatCard({ icon: Icon, iconWrap, iconClass, label, value, delta, deltaClass, hint }: {
  icon: typeof Users; iconWrap: string; iconClass: string;
  label: string; value: number | string; delta: string; deltaClass: string; hint: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center border ${iconWrap}`}>
          <Icon className={`h-5 w-5 ${iconClass}`} />
        </div>
        <span className={`text-xs font-semibold ${deltaClass}`}>{delta}</span>
      </div>
      <h3 className="text-slate-400 text-sm font-medium mb-1">{label}</h3>
      <p className="text-white text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-slate-500 text-xs mt-1">{hint}</p>
    </div>
  );
}

export function UsersSummaryCards({ summary }: Props) {
  const d = summary.deltas;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      <StatCard icon={Users} iconWrap="bg-blue-500/10 border-blue-500/30" iconClass="text-blue-400"
        label="Total Users" value={summary.total_users} delta={d.total} deltaClass="text-emerald-400"
        hint={`+${summary.new_this_month.toLocaleString()} this month`} />
      <StatCard icon={UserCheck} iconWrap="bg-emerald-500/10 border-emerald-500/30" iconClass="text-emerald-400"
        label="Verified Users" value={summary.verified_users} delta={d.verified} deltaClass="text-emerald-400" hint={`${summary.verification_rate}% verification rate`} />
      <StatCard icon={Flag} iconWrap="bg-red-500/10 border-red-500/30" iconClass="text-red-400"
        label="Flagged Users" value={summary.flagged_users} delta={d.flagged} deltaClass="text-red-400" hint="Requires review" />
      <StatCard icon={UserPlus} iconWrap={ADMIN_TONE.elevated.panel} iconClass={ADMIN_TONE.elevated.text}
        label="New This Week" value={summary.new_this_week} delta={d.new_week} deltaClass={ADMIN_TONE.elevated.text}
        hint={`${summary.new_per_day_avg}/day average`} />
      <StatCard icon={IdCard} iconWrap="bg-purple-500/10 border-purple-500/30" iconClass="text-purple-400"
        label="ID Verified" value={summary.id_verified} delta={d.id} deltaClass="text-purple-400"
        hint={`${summary.id_verified_pct}% of total`} />
      <StatCard icon={Mail} iconWrap="bg-slate-500/10 border-slate-500/30" iconClass="text-slate-400"
        label="Email Verified" value={summary.email_verified} delta={d.email} deltaClass="text-slate-400"
        hint={`${compactNumber(summary.email_verified)} verified`} />
    </div>
  );
}