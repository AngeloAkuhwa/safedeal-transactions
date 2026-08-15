import { useSearchParams } from "react-router";
import { Layers, FlaskConical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ENVIRONMENT,
  PERMISSION_ENVIRONMENTS,
  type PermissionEnvironment,
} from "@/services/permission-repository";
import { getStagedPermissionChangeCount } from "@/hooks/useStagedPermissionChanges";

const URL_KEY = "rm_env";

const META: Record<PermissionEnvironment, { label: string; icon: React.ReactNode; tint: string; ring: string }> = {
  production: {
    label: "Production",
    icon: <Layers className="h-3.5 w-3.5" />,
    tint: "text-emerald-300",
    ring: "ring-emerald-500/40 bg-emerald-500/10",
  },
  staging: {
    label: "Staging",
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    tint: "text-amber-300",
    ring: "ring-amber-500/40 bg-amber-500/10",
  },
  development: {
    label: "Development",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    tint: "text-sky-300",
    ring: "ring-sky-500/40 bg-sky-500/10",
  },
};

/**
 * Reads the current environment from the `rm_env` URL param. Missing = production.
 */
export function useCurrentEnvironment(): PermissionEnvironment {
  const [params] = useSearchParams();
  const raw = params.get(URL_KEY) as PermissionEnvironment | null;
  return raw && PERMISSION_ENVIRONMENTS.includes(raw) ? raw : DEFAULT_ENVIRONMENT;
}

/**
 * Segmented control for the Feature Registry & Permission Matrix environment
 * scope. Written to the shared `rm_env` URL param so deep-links preserve it.
 * The optional `beforeChange` hook lets callers guard unsaved staged edits
 * (returning false cancels the switch).
 */
export function EnvironmentSwitcher({ className }: { className?: string }) {
  const [params, setParams] = useSearchParams();
  const current = useCurrentEnvironment();

  const setEnv = (next: PermissionEnvironment) => {
    if (next === current) return;
    const staged = getStagedPermissionChangeCount();
    if (staged > 0) {
      const ok = window.confirm(
        `You have ${staged} unsaved staged change${staged === 1 ? "" : "s"}. Switching environments will discard them. Continue?`,
      );
      if (!ok) return;
    }
    const nextParams = new URLSearchParams(params);
    if (next === DEFAULT_ENVIRONMENT) nextParams.delete(URL_KEY);
    else nextParams.set(URL_KEY, next);
    setParams(nextParams, { replace: true });
    try {
      window.localStorage.setItem("permission-matrix.env", next);
    } catch { /* ignore */ }
  };

  return (
    <div
      role="tablist"
      aria-label="Environment"
      className={cn(
        // Three segments plus a label do not fit one 320px line; wrapping is
        // better than the segmented control running off the screen.
        "inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-border/60 bg-background/60 p-0.5 text-xs",
        className,
      )}
    >
      {PERMISSION_ENVIRONMENTS.map((env) => {
        const meta = META[env];
        const active = env === current;
        return (
          <button
            key={env}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => setEnv(env)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-semibold transition-colors min-h-11",
              active
                ? cn("ring-1 shadow-sm", meta.ring, meta.tint)
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {meta.icon}
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Amber (or sky) ribbon shown above the workspace tabs when the user is
 * viewing a non-production environment. Reinforces that Staging/Dev edits
 * are separate from the live Production configuration.
 */
export function EnvironmentRibbon() {
  const env = useCurrentEnvironment();
  if (env === "production") return null;
  const meta = META[env];
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs",
      env === "staging" ? "border-amber-500/40 bg-amber-500/5 text-amber-200" : "border-sky-500/40 bg-sky-500/5 text-sky-200",
    )}>
      {meta.icon}
      <span>
        <span className="font-semibold">Viewing {meta.label} environment.</span>{" "}
        Changes made here do not affect Production. Switch environments from the header.
      </span>
    </div>
  );
}