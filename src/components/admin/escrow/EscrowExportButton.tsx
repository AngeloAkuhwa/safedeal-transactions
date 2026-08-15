import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { runExport, type EscrowQuery } from "@/services/admin-escrow.service";
import { toast } from "@/hooks/use-toast";

export function EscrowExportButton({ query, className }: { query: EscrowQuery; className?: string }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      // Async pipeline: enqueue a background job and poll for the signed URL.
      // Avoids the 30s edge-function timeout on large exports.
      toast({ title: "Preparing export…", description: "Generating CSV in the background." });
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(query)) {
        if (k === "page" || k === "page_size") continue;
        if (v !== undefined && v !== null && v !== "") params[k] = v;
      }
      const { url, job } = await runExport("escrow", params);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safedeal-escrow-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast({
        title: "Export ready",
        description: `${job.row_count?.toLocaleString() ?? 0} rows downloaded.`,
      });
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
      className={className ?? "px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60 min-h-11"}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="hidden sm:inline">{busy ? "Exporting…" : "Export Report"}</span>
    </button>
  );
}