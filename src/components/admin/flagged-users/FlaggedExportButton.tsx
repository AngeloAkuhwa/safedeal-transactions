import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { type FlaggedQuery } from "@/services/admin-flagged-users.service";
import { runExport } from "@/services/admin-escrow.service";
import { toast } from "@/hooks/use-toast";

interface Props {
  query: FlaggedQuery;
  className?: string;
  label?: string;
}

export function FlaggedExportButton({ query, className, label = "Export Report" }: Props) {
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    try {
      toast({ title: "Preparing export…", description: "Generating CSV in the background." });
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(query)) {
        if (k === "page" || k === "page_size") continue;
        if (v !== undefined && v !== null && v !== "") params[k] = v;
      }
      const { url, job } = await runExport("flagged_users", params);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flagged-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast({ title: "Export ready", description: `${job.row_count?.toLocaleString() ?? 0} rows downloaded.` });
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <button type="button" onClick={onClick} disabled={loading} className={`inline-flex min-h-11 items-center ${className ?? ""}`}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}