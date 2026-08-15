import { Link } from "react-router";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SellerDisputeBlockedPayout } from "@/services/seller-disputes.service";

interface Props {
  items: SellerDisputeBlockedPayout[];
}

export function SellerDisputeBlockedPanel({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <Card className="rounded-2xl border-destructive/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4 text-destructive" />
          Blocked by Dispute
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs ml-auto">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.transaction_id}
            className="border border-destructive/15 bg-destructive/[0.02] rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <Link
                to={`/seller/transactions/${item.transaction_id}`}
                className="text-xs font-mono text-primary hover:underline"
              >
                {item.transaction_code ?? "—"}
              </Link>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                Frozen
              </Badge>
            </div>
            <p className="text-sm font-medium text-foreground truncate">{item.item_title ?? "—"}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{item.buyer_name ?? "—"}</span>
              <span className="text-sm font-bold text-foreground">{formatMoneyOrDash(item.amount, item.currency_code)}</span>
            </div>
            {item.dispute_id && (
              <Button variant="outline" size="sm" className="w-full h-11 text-xs mt-1" asChild>
                <Link to={`/seller/disputes/${item.dispute_id}?section=resolution`}>View Case</Link>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
