import { AlertCircle, Check, Star } from "lucide-react";
import { INTERNAL_ROLES, ROLE_LABEL, validateRoleSet, type InternalRoleKey } from "@/services/permission-catalog";

interface Props {
  roles: InternalRoleKey[];
  primaryRole: InternalRoleKey | null;
  onChange: (roles: InternalRoleKey[], primary: InternalRoleKey | null) => void;
}

export function RolePicker({ roles, primaryRole, onChange }: Props) {
  const validation = validateRoleSet(roles);

  const toggle = (key: InternalRoleKey) => {
    const has = roles.includes(key);
    const next = has ? roles.filter((r) => r !== key) : [...roles, key];
    // If the current primary was removed, promote the first remaining role.
    const nextPrimary =
      primaryRole && next.includes(primaryRole) ? primaryRole
      : (next[0] ?? null);
    onChange(next, nextPrimary);
  };

  const setPrimary = (key: InternalRoleKey) => {
    if (!roles.includes(key)) return;
    onChange(roles, key);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {INTERNAL_ROLES.map((r) => {
          const selected = roles.includes(r.key);
          const isPrimary = primaryRole === r.key;
          return (
            <div
              key={r.key}
              className={`rounded-lg border p-2.5 text-sm transition-colors ${
                selected ? "border-blue-500/50 bg-blue-500/10" : "border-border bg-muted/30 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggle(r.key)}
                  className={` mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border relative before:absolute before:-inset-4 before:content-[''] ${
                    selected ? "border-blue-500 bg-blue-600 text-white relative before:absolute before:-inset-4 before:content-['']" : "border-border bg-background"
                  }`}
                  aria-pressed={selected}
                >
                  {selected && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">{ROLE_LABEL[r.key]}</span>
                    {r.protected && (
                      <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                        Protected
                      </span>
                    )}
                    {selected && (
                      <button
                        type="button"
                        onClick={() => setPrimary(r.key)}
                        title={isPrimary ? "Primary role" : "Set as primary"}
                        className={`ml-auto rounded p-0.5 ${isPrimary ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"} min-h-11 min-w-11 justify-center`}
                      >
                        <Star className="h-3.5 w-3.5" fill={isPrimary ? "currentColor" : "none"} />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{r.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!validation.ok && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{validation.error}</span>
        </div>
      )}
    </div>
  );
}