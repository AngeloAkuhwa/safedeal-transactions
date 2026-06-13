import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportFlaggedUsersCsv, type FlaggedQuery } from "@/services/admin-flagged-users.service";
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
      const blob = await exportFlaggedUsersCsv(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flagged-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <button type="button" onClick={onClick} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}