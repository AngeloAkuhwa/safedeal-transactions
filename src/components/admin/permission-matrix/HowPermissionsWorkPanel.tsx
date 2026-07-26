import { useState, useEffect } from "react";
import { ChevronDown, Info, CheckCircle2, AlertTriangle, Lock, User, Shield, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "safedeal.permMatrix.helpDismissed";

const STATES = [
  { icon: CheckCircle2, tone: "text-emerald-400 bg-emerald-500/10", title: "Full Access", desc: "Complete control over all features and actions" },
  { icon: AlertTriangle, tone: "text-amber-400 bg-amber-500/10", title: "Partial Access", desc: "Limited functionality with specific restrictions" },
  { icon: Lock, tone: "text-muted-foreground bg-muted", title: "No Access", desc: "Complete restriction of all features and actions" },
  { icon: User, tone: "text-primary bg-primary/10", title: "User Override", desc: "Individual user permissions beyond role defaults" },
  { icon: Shield, tone: "text-destructive bg-destructive/10", title: "Restricted", desc: "Specific actions disabled or limited" },
  { icon: Clock, tone: "text-amber-400 bg-amber-500/10", title: "Pending Review", desc: "Changes awaiting approval or audit" },
];

export function HowPermissionsWorkPanel() {
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    const d = typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(d);
    setOpen(!d);
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (!next && typeof localStorage !== "undefined") {
        localStorage.setItem(DISMISS_KEY, "1");
        setDismissed(true);
      }
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">How permissions work</div>
            <div className="text-xs text-muted-foreground">
              {open ? "Overview of access states, roles and override behavior." : dismissed ? "Dismissed — click to review again." : "Click to expand."}
            </div>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border p-4">
          <p className="mb-4 text-xs text-muted-foreground">
            This workspace controls all security and access permissions across the SafeDeal platform. Configure what each role can access, what actions they can perform, and create user-specific overrides when needed. All changes are audited; privileged actions require Super Admin approval.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {STATES.map((s) => (
              <div key={s.title} className="rounded-lg border border-border/60 bg-card/50 p-3 text-center">
                <div className={cn("mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full", s.tone)}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="text-xs font-semibold text-foreground">{s.title}</div>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
