import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { OverrideRow } from "@/services/permission-workspace.service";
import { History } from "lucide-react";

interface AuditRow {
  id: string;
  action_type: string;
  action_notes: string | null;
  created_at: string;
  admin_user_id: string | null;
  actor_name?: string | null;
  metadata?: any;
}

export function ViewOverrideAuditDialog({
  override, open, onOpenChange,
}: { override: OverrideRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !override) return;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any)
        .from("admin_actions")
        .select("id,action_type,action_notes,created_at,admin_user_id,metadata")
        .eq("target_user_id", override.user_id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) { setRows([]); setLoading(false); return; }
      const filtered = (data ?? []).filter((r: any) => {
        const key = override.permission_key;
        return (r.action_notes ?? "").includes(key)
          || JSON.stringify(r.metadata ?? {}).includes(key);
      });
      setRows(filtered as AuditRow[]);
      setLoading(false);
    })();
  }, [open, override]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Audit history
          </DialogTitle>
        </DialogHeader>
        {override && (
          <div className="space-y-2 text-xs">
            <div className="rounded-md border border-border/60 bg-background/40 p-2">
              <div className="font-medium">{override.user_name}</div>
              <div className="font-mono text-[12px] text-muted-foreground">{override.permission_key}</div>
            </div>
            {loading && <div className="text-muted-foreground">Loading…</div>}
            {!loading && rows.length === 0 && (
              <div className="rounded-md border border-border/40 bg-background/30 p-3 text-muted-foreground">
                No audit entries recorded for this user + permission combination yet.
              </div>
            )}
            <ul className="max-h-96 space-y-1.5 overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id} className="rounded-md border border-border/60 bg-background/40 p-2">
                  <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                    <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5">{r.action_type}</span>
                  </div>
                  {r.action_notes && <div className="mt-1 text-foreground">{r.action_notes}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}