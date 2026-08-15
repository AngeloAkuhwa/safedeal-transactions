import { Users, UserCheck, Flag, UserPlus, IdCard, Mail } from "lucide-react";
import type { UserDirectorySummary } from "@/services/admin-users-directory.service";

interface Props { summary: UserDirectorySummary }

function StatTile({
  icon: Icon, iconWrap, iconClass, delta, deltaClass, label, value,
}: {
  icon: typeof Users; iconWrap: string; iconClass: string;
  delta: string; deltaClass: string; label: string; value: number;
}) {
  return (
    <div className="w-40 bg-slate-900 border border-slate-800 p-4 rounded-2xl flex-shrink-0">
      <div className="flex justify-between items-start mb-3">
        <div className={`p-2 rounded-lg ${iconWrap}`}>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <span className={`text-xs font-bold ${deltaClass}`}>{delta}</span>
      </div>
      <p className="text-slate-400 text-xs font-medium">{label}</p>
      <p className="text-white text-xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

export function UsersMobileStatsScroll({ summary }: Props) {
  const d = summary.deltas;
  return (
    <div className="lg:hidden p-4 overflow-x-auto">
      <div className="flex gap-4 pb-2 w-max">
        <StatTile icon={Users} iconWrap="bg-blue-500/10" iconClass="text-blue-400"
          delta={d.total} deltaClass="text-emerald-400" label="Total Users" value={summary.total_users} />
        <StatTile icon={UserCheck} iconWrap="bg-emerald-500/10" iconClass="text-emerald-400"
          delta={d.verified} deltaClass="text-emerald-400" label="Verified" value={summary.verified_users} />
        <StatTile icon={Flag} iconWrap="bg-red-500/10" iconClass="text-red-400"
          delta={d.flagged} deltaClass="text-red-400" label="Flagged" value={summary.flagged_users} />
        <StatTile icon={UserPlus} iconWrap="bg-orange-500/10" iconClass="text-orange-400"
          delta={d.new_week} deltaClass="text-orange-400" label="New This Week" value={summary.new_this_week} />
        <StatTile icon={IdCard} iconWrap="bg-purple-500/10" iconClass="text-purple-400"
          delta={d.id} deltaClass="text-purple-400" label="ID Verified" value={summary.id_verified} />
        <StatTile icon={Mail} iconWrap="bg-slate-500/10" iconClass="text-slate-400"
          delta={d.email} deltaClass="text-slate-400" label="Email Verified" value={summary.email_verified} />
      </div>
    </div>
  );
}