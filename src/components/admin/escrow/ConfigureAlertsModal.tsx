import { useEffect, useState } from "react";
import { Loader2, Settings } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  getEscrowAlertThresholds, updateEscrowAlertThresholds,
} from "@/services/admin-escrow-alerts.service";
import type { EscrowAlertThresholds } from "@/services/admin-escrow.service";
import { ADMIN_GROUND } from "@/components/admin/palette";
import { BlockSkeleton } from "@/components/common/PageSkeleton";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: EscrowAlertThresholds;
  onSaved?: (t: EscrowAlertThresholds) => void;
}

const FIELDS: Array<{ key: keyof EscrowAlertThresholds; label: string; suffix: string; help: string; step?: string }> = [
  { key: "frozen_days", label: "Frozen too long", suffix: "days", help: "Flag escrow frozen beyond this many days." },
  { key: "overdue_days", label: "Release overdue", suffix: "days", help: "Flag disputes/pending releases stalled beyond this many days." },
  { key: "idle_days", label: "Stuck / idle", suffix: "days", help: "Flag high-value escrow that hasn't moved in this many days." },
  { key: "high_value_amount", label: "High-value amount", suffix: "NGN", help: "Minimum held amount that counts as high-value." },
  { key: "mismatch_min_delta", label: "Mismatch tolerance", suffix: "NGN", help: "Minimum reconciliation drift before raising a mismatch alert.", step: "0.01" },
];

export function ConfigureAlertsModal({ open, onOpenChange, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<EscrowAlertThresholds | null>(initial ?? null);

  useEffect(() => {
    if (!open) return;
    if (initial) { setValues(initial); return; }
    setLoading(true);
    getEscrowAlertThresholds()
      .then((r) => setValues(r.thresholds))
      .catch((e) => toast({ title: "Failed to load thresholds", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, initial, toast]);

  const update = (k: keyof EscrowAlertThresholds, v: string) => {
    if (!values) return;
    setValues({ ...values, [k]: v === "" ? 0 : Number(v) });
  };

  const save = async () => {
    if (!values) return;
    setSaving(true);
    try {
      const res = await updateEscrowAlertThresholds(values);
      toast({ title: "Alert thresholds updated" });
      onSaved?.(res.thresholds);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ADMIN_GROUND.panel} text-white max-w-lg`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Settings className="h-5 w-5 text-sky-400" /> Configure Escrow Alerts
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Thresholds used to flag frozen, overdue, stuck and mismatched escrow records.
          </DialogDescription>
        </DialogHeader>

        {loading || !values ? (
          <BlockSkeleton label="Loading alert settings" lines={4} className="py-4" />
        ) : (
          <div className="space-y-4 py-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key} className="text-slate-200 text-sm">{f.label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={f.key}
                    type="number"
                    step={f.step ?? "1"}
                    min={0}
                    value={String(values[f.key])}
                    onChange={(e) => update(f.key, e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <span className="text-xs text-slate-400 shrink-0 w-12">{f.suffix}</span>
                </div>
                <p className="text-xs text-slate-500">{f.help}</p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading || !values} className="bg-sky-600 hover:bg-sky-700">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : "Save thresholds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}