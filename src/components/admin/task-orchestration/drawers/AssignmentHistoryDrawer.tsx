import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export interface HistoryEntry {
  id: string;
  when: string;
  actor: string;
  action: string;
  detail?: string;
}

export function AssignmentHistoryDrawer({
  open, onOpenChange, title, entries,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  entries: HistoryEntry[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Assignment &amp; status changes</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2 max-h-[70dvh] overflow-y-auto pr-1">
          {entries.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
              No history yet.
            </div>
          )}
          {entries.map(e => (
            <div key={e.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{e.action}</span>
                <span>{e.when}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">by {e.actor}</div>
              {e.detail && <div className="mt-1 text-xs text-foreground">{e.detail}</div>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}