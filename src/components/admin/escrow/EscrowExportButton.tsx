import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportEscrowCsv, type EscrowQuery } from "@/services/admin-escrow.service";
import { toast } from "@/hooks/use-toast";

export function EscrowExportButton({ query, className }: { query: EscrowQuery; className?: string }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const blob = await exportEscrowCsv(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safedeal-escrow-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: "CSV downloaded." });
    } catch (err) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={className ?? "px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60"}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="hidden sm:inline">{busy ? "Exporting…" : "Export Report"}</span>
    </button>
  );
}