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
    <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCheck className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold truncate">{selected.length} selected</p>
            <p className="text-[12px] sm:text-xs text-muted-foreground truncate">Total: {formatMoney(total, "NGN")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={onProcess} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 sm:h-9 text-xs sm:text-sm">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Process
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} className="gap-1 h-11 sm:h-9 text-xs sm:text-sm">
            <X className="h-4 w-4" /> <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>
    </div>
  );
}