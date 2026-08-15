import { Link } from "react-router";
import { AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SellerDisputeActionNeeded } from "@/services/seller-disputes.service";

function formatDeadline(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffH <= 0) return "Overdue";
  if (diffH <= 24) return `${diffH}h left`;
  const diffD = Math.ceil(diffH / 24);
  return `${diffD}d left`;
}

interface Props {
  items: SellerDisputeActionNeeded[];
}

export function SellerDisputeActionPanel({ items }: Props) {
  return (
    <Card className="rounded-2xl border-warning/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Action Needed
          {items.length > 0 && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs ml-auto">
              {items.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-6">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No actions required right now.</p>
          </div>
        ) : (
          items.slice(0, 5).map((item) => {
            const deadline = formatDeadline(item.deadline);
            return (
              <div
                key={item.dispute_id}
                className="border border-warning/20 bg-warning/[0.03] rounded-xl p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Link
                    to={`/seller/transactions/${item.transaction_id}`}
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {item.transaction_code ?? "—"}
                  </Link>
                  {deadline && (
                    <span className={`text-xs font-semibold ${deadline === "Overdue" ? "text-destructive" : "text-warning"}`}>
                      {deadline}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground">{item.reason_label}</p>
                {item.buyer_name && (
                  <p className="text-xs text-muted-foreground">Buyer: {item.buyer_name}</p>
                )}
                <p className="text-xs text-muted-foreground">{item.action_required}</p>
                <Button variant="default" size="sm" className="w-full h-11 text-xs mt-1" asChild>
                  <Link to={`/seller/disputes/${item.dispute_id}?section=overview`}>Respond</Link>
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
