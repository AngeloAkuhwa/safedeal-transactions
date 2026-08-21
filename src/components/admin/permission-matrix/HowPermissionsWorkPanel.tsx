import { useEffect, useState } from "react";
import { ChevronDown, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PermissionPanel } from "./PermissionPanel";
import { PermissionRowStateBadge } from "./PermissionRowStateBadge";
import type { PermissionRowState } from "@/services/permission-catalog";

const DISMISS_KEY = "safedeal.permMatrix.helpDismissed";

const LEGEND: Array<{ state: PermissionRowState; title: string; desc: string }> = [
  { state: "granted",          title: "Full",       desc: "Complete control over all actions in the module." },
  { state: "override_granted", title: "Override",   desc: "User-specific grant that extends beyond the role." },
  { state: "pending",          title: "Pending",    desc: "Change awaiting approval or audit review." },
  { state: "denied",           title: "None",       desc: "No access to this feature for the selected role." },
  { state: "override_denied",  title: "Limited",    desc: "Partial access: some actions removed by override." },
  { state: "restricted",       title: "Restricted", desc: "Disabled by policy; cannot be granted from this screen." },
];

export function HowPermissionsWorkPanel() {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const d = typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(d);
    setOpen(!d);
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(DISMISS_KEY, next ? "0" : "1");
        setDismissed(!next);
      }
      return next;
    });
  };

  return (
    <PermissionPanel
      className="bg-gradient-to-br from-sky-500/[0.06] via-card/60 to-transparent"
      icon={<Info className="h-4 w-4" />}
      title="How permissions work"
      subtitle={open ? "Overview of access states, roles and override behavior." : dismissed ? "Collapsed: click to expand again." : "Click to expand."}
      actions={
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60"
        >
          <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
      }
    >
      {!open ? (
        <p className="text-xs text-muted-foreground">6 access states · role-based · override-capable</p>
      ) : (
        <div className="space-y-5">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            This workspace controls all security and access permissions across the SafeDeal platform. Configure what each role can access, what actions they can perform, and create user-specific overrides when needed. All changes are audited; privileged actions require Super Admin approval.
          </p>
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/[0.06] p-3 text-xs text-amber-200/90">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <span className="font-semibold text-amber-200">Security notice.</span>{" "}
              All permission changes are automatically logged and audited. Changes to privileged actions (Export, Impersonate, Financial Controls) require approval from a Super Admin before taking effect.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEGEND.map((l) => (
              <div
                key={l.title}
                className="flex items-start gap-3 rounded-xl bg-background/40 p-3"
              >
                <PermissionRowStateBadge state={l.state} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{l.title}</div>
                  <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{l.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PermissionPanel>
  );
}
