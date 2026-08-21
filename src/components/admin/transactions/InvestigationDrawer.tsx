import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, Search, History } from "lucide-react";
import type {
  InvestigationStatus, InvestigationPriority,
} from "@/services/admin-transaction-actions.service";

const STATUS: InvestigationStatus[] = ["open", "under_review", "escalated", "resolved", "dismissed"];
const PRIORITY: InvestigationPriority[] = ["low", "medium", "high", "critical"];
const TAGS = ["payment", "dispute", "delivery", "user_risk", "fraud_risk", "evidence_conflict", "payout_risk"] as const;

export interface InvestigationData {
  id?: string;
  status?: InvestigationStatus;
  priority?: InvestigationPriority;
  tags?: string[];
  assignedAdmin?: { id: string; name: string | null } | null;
  openedBy?: { id: string; name: string | null } | null;
  openedAt?: string | null;
  updatedAt?: string | null;
  resolvedAt?: string | null;
  history?: Array<{ at: string; kind: string; by: string | null; note?: string | null }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transactionCode: string;
  investigation: InvestigationData | null;
  onSubmit: (payload: {
    status: InvestigationStatus;
    priority: InvestigationPriority;
    tags: string[];
    note?: string;
    assigned_admin_id?: string | null;
  }) => Promise<void> | void;
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}

export function InvestigationDrawer({ open, onOpenChange, transactionCode, investigation, onSubmit }: Props) {
  const existing = !!investigation?.id;
  const [status, setStatus] = useState<InvestigationStatus>("open");
  const [priority, setPriority] = useState<InvestigationPriority>("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus((investigation?.status as InvestigationStatus) ?? "open");
    setPriority((investigation?.priority as InvestigationPriority) ?? "medium");
    setTags(Array.isArray(investigation?.tags) ? investigation!.tags!.filter((t) => (TAGS as readonly string[]).includes(t)) : []);
    setNote("");
  }, [open, investigation]);

  const history = useMemo(
    () => (investigation?.history ?? []).slice(0, 50),
    [investigation?.history],
  );

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const close = (v: boolean) => { if (submitting) return; onOpenChange(v); };

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({
        status, priority, tags,
        note: note.trim() || undefined,
        assigned_admin_id: investigation?.assignedAdmin?.id ?? null,
      });
      close(false);
    } finally { setSubmitting(false); }
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            {existing ? "Update investigation" : "Open investigation"}
          </SheetTitle>
          <SheetDescription>
            #{transactionCode}: investigations are recorded in the audit trail.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {existing && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Opened by {investigation?.openedBy?.name ?? "—"} · {fmt(investigation?.openedAt)}
              {investigation?.assignedAdmin?.name && (
                <> · Assigned to {investigation.assignedAdmin.name}</>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as InvestigationStatus)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-11">
                {STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as InvestigationPriority)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-11">
                {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="mb-1 block text-sm">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs transition-colors min-h-11 " +
                      (on
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:text-foreground")
                    }
                  >
                    {t.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block">Note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1900}
              placeholder="Add context for this update…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => close(false)} disabled={submitting}
              className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm min-h-11">Cancel</button>
            <button type="button" onClick={submit} disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 min-h-11">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {existing ? "Save changes" : "Open investigation"}
            </button>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="h-4 w-4" /> History
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h, i) => (
                  <li key={i} className="rounded-md border border-border bg-card p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{h.kind.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{fmt(h.at)}</span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      {h.by ?? "Admin"}{h.note ? `: ${h.note}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}