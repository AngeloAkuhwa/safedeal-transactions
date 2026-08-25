import { Flag, AlertTriangle, Ban, CheckCircle2, Bot } from "lucide-react";
import { ADMIN_TONE } from "@/components/admin/palette";
import type { FlaggedSummary } from "@/services/admin-flagged-users.service";

interface Props {
  summary: FlaggedSummary;
}

function Card({
  icon: Icon,
  iconWrap,
  iconClass,
  label,
  value,
  delta,
  deltaClass,
  hint,
}: {
  icon: typeof Flag;
  iconWrap: string;
  iconClass: string;
  label: string;
  value: number;
  delta: string;
  deltaClass: string;
  hint: string;
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
      <p className="text-white text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-slate-500 text-xs mt-1">{hint}</p>
    </div>
  );
}

export function FlaggedSummaryCards({ summary }: Props) {
  const d = summary.delta;
  return (
    <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
      <Card
        icon={Flag}
        iconWrap={ADMIN_TONE.danger.panel}
        iconClass="text-red-400"
        label="Total Flagged"
        value={summary.total_flagged}
        delta={d.flagged_today > 0 ? `+${d.flagged_today} today` : "No change"}
        deltaClass="text-red-400"
        hint="Active flags requiring review"
      />
      <Card
        icon={AlertTriangle}
        iconWrap={ADMIN_TONE.elevated.panel}
        iconClass={ADMIN_TONE.elevated.text}
        label="High Risk"
        value={summary.high_risk}
        delta={summary.critical > 0 ? `${summary.critical} Critical` : "Critical"}
        deltaClass={ADMIN_TONE.elevated.text}
        hint="Immediate attention needed"
      />
      <Card
        icon={Ban}
        iconWrap={ADMIN_TONE.special.panel}
        iconClass="text-purple-400"
        label="Suspended"
        value={summary.suspended}
        delta={d.suspended_today > 0 ? `+${d.suspended_today} today` : "No change"}
        deltaClass="text-purple-400"
        hint="Accounts under suspension"
      />
      <Card
        icon={CheckCircle2}
        iconWrap={ADMIN_TONE.success.panel}
        iconClass="text-emerald-400"
        label="Cleared"
        value={summary.cleared_this_week}
        delta={d.cleared_today > 0 ? `+${d.cleared_today} today` : "This week"}
        deltaClass="text-emerald-400"
        hint="Flags resolved this week"
      />
      <Card
        icon={Bot}
        iconWrap={ADMIN_TONE.info.panel}
        iconClass="text-blue-400"
        label="Auto-Detection"
        value={summary.auto_detected}
        delta="Auto-Detected"
        deltaClass="text-blue-400"
        hint="Fraud patterns identified by system"
      />
    </div>
  );
}