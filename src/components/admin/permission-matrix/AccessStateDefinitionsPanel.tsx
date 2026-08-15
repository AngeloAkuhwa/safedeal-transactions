import { CheckCircle2, AlertTriangle, Lock, User, Ban, Clock, KeyRound } from "lucide-react";
import { PermissionPanel } from "./PermissionPanel";

const STATES = [
  { key: "full",       Icon: CheckCircle2,   tint: "bg-emerald-500/15 text-emerald-300",       title: "Full Access",    desc: "Complete control over all features and actions" },
  { key: "partial",    Icon: AlertTriangle,  tint: "bg-amber-500/15 text-amber-300",           title: "Partial Access", desc: "Limited functionality with specific restrictions" },
  { key: "none",       Icon: Lock,           tint: "bg-muted/60 text-muted-foreground",        title: "No Access",      desc: "Complete restriction of all features and actions" },
  { key: "override",   Icon: User,           tint: "bg-sky-500/15 text-sky-300",               title: "User Override",  desc: "Individual user permissions beyond role defaults" },
  { key: "restricted", Icon: Ban,            tint: "bg-rose-500/15 text-rose-300",             title: "Restricted",     desc: "Specific actions disabled or limited by policy" },
  { key: "pending",    Icon: Clock,          tint: "bg-amber-400/15 text-amber-200",           title: "Pending Review", desc: "Changes awaiting approval or audit" },
];

export function AccessStateDefinitionsPanel() {
  return (
    <PermissionPanel
      icon={<KeyRound className="h-4 w-4" />}
      title="Access state definitions"
      subtitle="How each cell in the matrix is interpreted across roles."
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {STATES.map((s) => (
          <div
            key={s.key}
            className="flex flex-col items-center gap-2 rounded-xl bg-background/40 p-4 text-center"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${s.tint}`}>
              <s.Icon className="h-5 w-5" />
            </span>
            <div className="text-sm font-semibold text-foreground">{s.title}</div>
            <div className="text-xs leading-snug text-muted-foreground">{s.desc}</div>
          </div>
        ))}
      </div>
    </PermissionPanel>
  );
}