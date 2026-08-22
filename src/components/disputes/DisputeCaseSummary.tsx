import { FileText, Package } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { DisputeDetailResponse } from "@/services/disputes.service";

interface DisputeCaseSummaryProps {
  transaction: DisputeDetailResponse["transaction"];
  item: DisputeDetailResponse["item"];
  pricing: DisputeDetailResponse["pricing"];
  seller: DisputeDetailResponse["seller"];
}

const formatAmount = (amount: number, currency: string) =>
  formatMoney(amount, currency);

export function DisputeCaseSummary({ transaction, item, pricing, seller }: DisputeCaseSummaryProps) {
  const sellerInitials = seller?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/50 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Transaction Details</h3>
          </div>
          {transaction.code && (
            <Badge variant="secondary" className="font-mono text-xs">
              #{transaction.code}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Item info */}
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
            <Package className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">
              {item?.title ?? "Untitled Item"}
            </p>
            {item?.condition_label && (
              <p className="text-sm text-muted-foreground">
                Condition: {item.condition_label}
              </p>
            )}
            {item?.quantity && item.quantity > 1 && (
              <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
            )}
          </div>
        </div>

        {/* Seller */}
        {seller && (
          <div className="flex items-center gap-3 pt-2 border-t border-border">
            <Avatar className="h-8 w-8">
              <AvatarImage src={seller.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">{sellerInitials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-foreground">{seller.name ?? "Unknown Seller"}</p>
              <p className="text-xs text-muted-foreground">Seller</p>
            </div>
          </div>
        )}

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
            <p className="text-base font-bold text-foreground">
              {pricing
                ? formatAmount(pricing.buyer_total_amount, pricing.currency_code)
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Purchase Date</p>
            <p className="text-sm font-medium text-foreground">
              {format(new Date(transaction.created_at), "MMM d, yyyy")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
