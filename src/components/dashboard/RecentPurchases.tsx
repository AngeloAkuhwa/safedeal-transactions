import { Link } from "react-router-dom";
import { Receipt, ArrowRight, Package, Truck, Scale, Clock, CheckCircle, Lock, Snowflake, Unlock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardPurchase } from "@/services/dashboard.service";
import { format } from "date-fns";

interface RecentPurchasesProps {
  purchases: DashboardPurchase[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case "delivered_awaiting_verification":
      return { label: "Delivered", icon: Package, className: "bg-success/10 text-success border-success/20" };
    case "seller_dispatched":
      return { label: "In Transit", icon: Truck, className: "bg-primary/10 text-primary border-primary/20" };
    case "disputed":
      return { label: "In Dispute", icon: Scale, className: "bg-destructive/10 text-destructive border-destructive/20" };
    case "completed":
      return { label: "Completed", icon: CheckCircle, className: "bg-success/10 text-success border-success/20" };
    default:
      return { label: "Processing", icon: Clock, className: "bg-muted text-muted-foreground border-border" };
  }
}

function getMoneyBadge(status: string) {
  switch (status) {
    case "funds_held_in_escrow":
      return { label: "Held", icon: Lock, className: "bg-warning/10 text-warning border-warning/20" };
    case "funds_frozen":
      return { label: "Frozen", icon: Snowflake, className: "bg-warning/10 text-warning border-warning/20" };
    case "funds_released":
      return { label: "Released", icon: Unlock, className: "bg-success/10 text-success border-success/20" };
    case "refund_issued":
      return { label: "Refunded", icon: CheckCircle, className: "bg-success/10 text-success border-success/20" };
    default:
      return { label: "Pending", icon: Clock, className: "bg-muted text-muted-foreground border-border" };
  }
}

function getActionButton(status: string) {
  switch (status) {
    case "delivered_awaiting_verification":
      return { label: "Verify Item", className: "bg-success text-success-foreground hover:bg-success/90" };
    case "seller_dispatched":
      return { label: "Track Order", className: "bg-primary text-primary-foreground hover:bg-primary/90" };
    case "disputed":
      return { label: "View Dispute", className: "bg-destructive text-destructive-foreground hover:bg-destructive/90" };
    case "completed":
      return { label: "View Receipt", className: "bg-secondary text-secondary-foreground hover:bg-secondary/80" };
    default:
      return { label: "View Details", className: "bg-secondary text-secondary-foreground hover:bg-secondary/80" };
  }
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function RecentPurchases({ purchases }: RecentPurchasesProps) {
  return (
    <Card className="shadow-md overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Recent Purchases</CardTitle>
        </div>
        <Link
          to="/dashboard/transactions"
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          View All Transactions
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {purchases.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Package className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No purchases yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your protected purchases will appear here
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Transaction</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Item</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Seller</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Money Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => {
                  const statusBadge = getStatusBadge(purchase.transaction_status);
                  const moneyBadge = getMoneyBadge(purchase.money_status);
                  const action = getActionButton(purchase.transaction_status);
                  const StatusIcon = statusBadge.icon;
                  const MoneyIcon = moneyBadge.icon;

                  return (
                    <TableRow key={purchase.transaction_id}>
                      <TableCell>
                        <div className="text-sm font-bold text-foreground">
                          #{purchase.transaction_code}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(purchase.created_at), "MMM d, yyyy")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-semibold text-foreground">
                          {purchase.item_title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-foreground">
                          {purchase.seller_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-bold text-foreground">
                          {formatAmount(purchase.amount, purchase.currency_code)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${statusBadge.className} gap-1`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${moneyBadge.className} gap-1`}
                        >
                          <MoneyIcon className="h-3 w-3" />
                          {moneyBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" className={action.className}>
                          {action.label}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
