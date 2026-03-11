import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeftRight, Eye } from "lucide-react";
import type { SellerActivity } from "@/services/seller-dashboard.service";

interface SellerRecentActivityProps {
  activity: SellerActivity[];
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  awaiting_buyer: { label: "Awaiting Buyer", variant: "outline" },
  awaiting_payment: { label: "Awaiting Payment", variant: "outline" },
  payment_secured: { label: "Payment Secured", variant: "default" },
  seller_preparing_delivery: { label: "Preparing Delivery", variant: "default" },
  seller_dispatched: { label: "Dispatched", variant: "default" },
  delivered_awaiting_verification: { label: "Awaiting Verification", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  disputed: { label: "Disputed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

function formatCurrency(amount: number, currency: string) {
  if (currency === "NGN") return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function SellerRecentActivity({ activity }: SellerRecentActivityProps) {
  if (activity.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <ArrowLeftRight className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-1">No transactions yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first protected transaction to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <a href="/seller/transactions">View All</a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead className="hidden sm:table-cell">Buyer</TableHead>
              <TableHead className="hidden md:table-cell">Item</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.map((row) => {
              const statusInfo = statusLabels[row.transaction_status] ?? { label: row.transaction_status, variant: "secondary" as const };
              return (
                <TableRow key={row.transaction_id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {row.transaction_code}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div>
                      <p className="text-sm font-medium text-foreground">{row.buyer_name}</p>
                      <p className="text-xs text-muted-foreground">{row.buyer_email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="text-sm text-foreground truncate max-w-[200px]">{row.item_title}</p>
                  </TableCell>
                  <TableCell className="font-semibold text-sm">
                    {formatCurrency(row.amount, row.currency_code)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
