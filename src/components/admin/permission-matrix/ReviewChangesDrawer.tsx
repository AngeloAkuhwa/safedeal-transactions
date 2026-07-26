import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ApprovalRow, HistoryRow } from "@/services/permission-workspace.service";
import { HISTORY_ACTION_LABEL } from "@/services/permission-workspace.service";

export function ReviewChangesDrawer({
  approval,
  history,
  open,
  onOpenChange,
}: {
  approval?: ApprovalRow | null;
  history?: HistoryRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const title = approval ? `Change request` : history ? (HISTORY_ACTION_LABEL[history.action_type] ?? history.action_type) : "Change";
  const payload = approval?.payload ?? history?.metadata ?? null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          {approval && (
            <>
              <Field label="Target user" value={approval.target_user_name} />
              <Field label="Requested by" value={approval.requested_by_name} />
              <Field label="Reason" value={approval.reason ?? "—"} />
            </>
          )}
          {history && (
            <>
              <Field label="Actor" value={history.actor_name ?? "System"} />
              <Field label="Target" value={history.target_user_name ?? "—"} />
              <Field label="Summary" value={history.summary ?? "—"} />
            </>
          )}
          <div>
            <div className="mb-1 text-xs uppercase text-muted-foreground">Payload</div>
            <pre className="max-h-[400px] overflow-auto rounded-md border border-border bg-background/70 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {payload ? JSON.stringify(payload, null, 2) : "—"}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
