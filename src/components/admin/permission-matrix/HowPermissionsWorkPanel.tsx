import { useState, useEffect } from "react";
import { ChevronDown, Info, CheckCircle2, AlertTriangle, Lock, User, Shield, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "safedeal.permMatrix.helpDismissed";

const STATES = [
  { icon: CheckCircle2, dot: "bg-emerald-500", title: "Full",       desc: "Complete control over all actions" },
  { icon: AlertTriangle, dot: "bg-amber-500",  title: "Limited",    desc: "Partial access with restrictions" },
  { icon: Lock,          dot: "bg-muted-foreground/60", title: "None", desc: "No access to this feature" },
  { icon: User,          dot: "bg-primary",     title: "Override",   desc: "User-specific grant beyond role" },
  { icon: Shield,        dot: "bg-destructive", title: "Restricted", desc: "Actions disabled by policy" },
  { icon: Clock,         dot: "bg-amber-400",   title: "Pending",    desc: "Awaiting approval or audit" },
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
    <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
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
        <div className="border-t border-border/60 p-4">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground text-balance">
            This workspace controls all security and access permissions across the SafeDeal platform. Configure what each role can access, what actions they can perform, and create user-specific overrides when needed. All changes are audited; privileged actions require Super Admin approval.
          </p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {STATES.map((s) => (
              <li key={s.title} className="flex items-center gap-2 text-xs">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
                <span className="font-semibold text-foreground">{s.title}</span>
                <span className="text-muted-foreground">— {s.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
