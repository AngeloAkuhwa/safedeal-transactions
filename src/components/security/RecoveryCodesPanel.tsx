import { useState } from "react";
import { Copy, Download, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { generateRecoveryCodes } from "@/services/mfa.service";

interface Props {
  unused: number;
  total: number;
  onGenerated?: () => void;
}

/**
 * Recovery codes are shown exactly once, right after generation. They are
 * never stored in the browser and never re-fetchable. Only regenerable.
 */
export function RecoveryCodesPanel({ unused, total, onGenerated }: Props) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const next = await generateRecoveryCodes();
      setCodes(next);
      onGenerated?.();
      toast.success("New recovery codes generated. Previous codes no longer work.");
    } catch (err) {
      toast.error((err as Error).message || "Could not generate recovery codes");
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    if (!codes) return;
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Codes copied to clipboard");
  };

  const download = () => {
    if (!codes) return;
    const blob = new Blob(
      [`SafeDeal two-factor recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "safedeal-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Recovery codes</p>
          <p className="text-xs text-muted-foreground">
            Use one if you lose your authenticator app. Each code works once.
          </p>
        </div>
        <Badge variant="outline" className="text-muted-foreground shrink-0">
          {unused}/{total} unused
        </Badge>
      </div>

      {codes && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
            <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              These codes are shown once and cannot be retrieved again. Save them somewhere safe now.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((c) => (
              <div key={c} className="rounded border bg-background px-2 py-1 text-center">{c}</div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {total > 0 ? "Regenerate codes" : "Generate codes"}
      </Button>
    </div>
  );
}