import { relativeTime, type AccessAuditEntry } from "@/services/admin-access-control.service";

const SEVERITY_TINT: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/10 text-red-300 border-red-500/40",
};

interface Props {
  entries: AccessAuditEntry[] | undefined;
}

export function AccessHistoryTimeline({ entries }: Props) {
  const items = entries ?? [];
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">No changes recorded.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_TINT[a.severity] ?? SEVERITY_TINT.info}`}>
          <div className="font-semibold text-foreground">{a.action.split("_").join(" ")}</div>
          <div>{a.detail}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {a.actor_name} · {relativeTime(a.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}