import { CheckCheck, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { PayoutRow } from "@/services/admin-payouts.service";

interface Props {
  selected: PayoutRow[];
  onClear: () => void;
  onProcess: () => void;
  processing: boolean;
}

export function PayoutBatchBar({ selected, onClear, onProcess, processing }: Props) {
  if (selected.length === 0) return null;
  const total = selected.reduce((acc, r) => acc + r.amount, 0);
  return (
    <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400">
            <CheckCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{selected.length} payout{selected.length === 1 ? "" : "s"} selected</p>
            <p className="text-xs text-muted-foreground">Total: {formatMoney(total, "NGN")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={onProcess} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Process Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} className="gap-2">
            <X className="h-4 w-4" /> Clear
          </Button>
        </div>
      </div>
    </div>
  );
}