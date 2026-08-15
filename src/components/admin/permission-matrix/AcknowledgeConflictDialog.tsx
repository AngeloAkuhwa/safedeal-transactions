import { useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { PERMISSION_MODULES, ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { keyActivate } from "@/lib/a11y";

interface Props {
  open: boolean;
  role: InternalRoleKey | null;
  aKey: string | null;
  bKey: string | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (reason: string, expiresAt: string | null) => void;
}

function label(k: string) {
  for (const m of PERMISSION_MODULES) {
    const p = m.permissions.find((x) => x.key === k);
    if (p) return p.label;
  }
  return k;
}

export function AcknowledgeConflictDialog({ open, role, aKey, bKey, submitting, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState("");
  const [expiresIn, setExpiresIn] = useState<"never" | "30d" | "90d" | "180d">("never");

  if (!open || !role || !aKey || !bKey) return null;

  const canSubmit = reason.trim().length >= 8 && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    let expiresAt: string | null = null;
    if (expiresIn !== "never") {
      const days = expiresIn === "30d" ? 30 : expiresIn === "90d" ? 90 : 180;
      expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
    }
    onSubmit(reason.trim(), expiresAt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div role="button" tabIndex={0} onKeyDown={keyActivate} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/60 bg-card p-5 shadow-2xl">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold">Acknowledge conflict</div>
              <div className="text-xs text-muted-foreground">Mute this segregation-of-duties finding with a reason.</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted min-h-11 min-w-11 inline-flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="rounded-lg bg-background/40 p-3 text-xs">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</div>
          <div className="mb-2 font-medium">{ROLE_LABEL[role]}</div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conflict</div>
          <div className="font-medium">{label(aKey)} <span className="text-muted-foreground">↔</span> {label(bKey)}</div>
          <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
            <code>{aKey}</code><code>{bKey}</code>
          </div>
        </div>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reason <span className="text-rose-400">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why is this conflict acceptable? (min 8 characters)"
          className="mt-1 w-full rounded-md border border-border bg-background/60 p-2 text-xs outline-none focus:border-primary"
        />

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expires</label>
        <select
          value={expiresIn}
          onChange={(e) => setExpiresIn(e.target.value as typeof expiresIn)}
          className="mt-1 h-11 w-full rounded-md border border-border bg-background/60 px-2 text-xs outline-none focus:border-primary"
        >
          <option value="never">Never (permanent until revoked)</option>
          <option value="30d">In 30 days</option>
          <option value="90d">In 90 days</option>
          <option value="180d">In 180 days</option>
        </select>

        <footer className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs font-medium hover:bg-muted min-h-11"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-11"
          >
            {submitting ? "Saving…" : "Acknowledge"}
          </button>
        </footer>
      </div>
    </div>
  );
}