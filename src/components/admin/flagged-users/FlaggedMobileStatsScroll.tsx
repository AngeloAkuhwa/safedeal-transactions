import { Flag, AlertTriangle, Ban } from "lucide-react";
import { ADMIN_GROUND, ADMIN_TONE } from "@/components/admin/palette";
import type { FlaggedSummary } from "@/services/admin-flagged-users.service";

export function FlaggedMobileStatsScroll({ summary }: { summary: FlaggedSummary }) {
  const items = [
    { icon: Flag, wrap: "bg-red-500/10", color: "text-red-400", value: summary.total_flagged, label: "Total Flagged" },
    { icon: AlertTriangle, wrap: "bg-orange-500/10", color: ADMIN_TONE.elevated.text, value: summary.critical, label: "Critical Risk" },
    { icon: Ban, wrap: "bg-purple-500/10", color: "text-purple-400", value: summary.suspended, label: "Suspended" },
  ];
  return (
    <div className="lg:hidden flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
      {items.map(({ icon: Icon, wrap, color, value, label }) => (
        <div key={label} className={`min-w-[160px] ${ADMIN_GROUND.panel} border rounded-2xl p-4 snap-start`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${wrap}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
          <div className="text-xs text-slate-400">{label}</div>
        </div>
      ))}
    </div>
  );
}