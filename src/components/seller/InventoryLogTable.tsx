import { useQuery } from "@tanstack/react-query";
import { History, Loader2, ArrowDownRight, ArrowUpRight, RotateCw, ShoppingCart, Settings2 } from "lucide-react";
import { getInventoryLogs, type InventoryLogEntry } from "@/services/inventory.service";

interface InventoryLogTableProps {
  productId: string;
}

const CHANGE_LABEL: Record<InventoryLogEntry["change_type"], string> = {
  restock: "Restock",
  reserve: "Reserved",
  release: "Released",
  sold: "Sold",
  manual_adjustment: "Adjusted",
};

function ChangeIcon({ type }: { type: InventoryLogEntry["change_type"] }) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "restock":
      return <ArrowUpRight className={`${cls} text-emerald-500`} />;
    case "sold":
      return <ShoppingCart className={`${cls} text-blue-500`} />;
    case "reserve":
      return <ArrowDownRight className={`${cls} text-amber-500`} />;
    case "release":
      return <RotateCw className={`${cls} text-muted-foreground`} />;
    case "manual_adjustment":
      return <Settings2 className={`${cls} text-violet-500`} />;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InventoryLogTable({ productId }: InventoryLogTableProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["inventory-logs", productId],
    queryFn: () => getInventoryLogs(productId),
    enabled: !!productId,
  });

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Inventory history</h3>
          <p className="text-xs text-muted-foreground">Last 20 stock movements</p>
        </div>
      </div>

      <div className="p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No inventory movements yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 rounded-md border border-border bg-muted/40 p-1.5">
                  <ChangeIcon type={log.change_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">
                      {CHANGE_LABEL[log.change_type]}{" "}
                      <span
                        className={`ml-1 text-xs font-semibold ${
                          log.quantity_delta > 0 ? "text-emerald-500" : "text-destructive"
                        }`}
                      >
                        {log.quantity_delta > 0 ? "+" : ""}
                        {log.quantity_delta}
                      </span>
                    </p>
                    <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
                  </div>
                  {log.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.notes}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Available after: <span className="font-semibold text-foreground">{log.balance_after}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
