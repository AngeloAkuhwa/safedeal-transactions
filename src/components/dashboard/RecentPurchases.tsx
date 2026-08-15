import { Link, useNavigate } from "react-router";
import { Receipt, ArrowRight, Package, Truck, Scale, Clock, CheckCircle, Lock, Snowflake, Unlock } from "lucide-react";
import { formatMoney } from "@/lib/format";
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

function resolveRoute(purchase: DashboardPurchase): string {
  if (purchase.transaction_status === "delivered_awaiting_verification") {
    return `/dashboard/transactions/${purchase.transaction_id}/verify`;
  }
  return `/dashboard/transactions/${purchase.transaction_id}`;
}

const formatAmount = (amount: number, currency: string) =>
  formatMoney(amount, currency);

export function RecentPurchases({ purchases }: RecentPurchasesProps) {
  const navigate = useNavigate();

  return (
    <Card className="sd-card overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Receipt className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide">Recent Purchases</CardTitle>
        </div>
        <Link
          to="/dashboard/transactions"
          className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          View All
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {purchases.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No purchases yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your purchases will appear here
            </p>
          </div>
        ) : (
          <>
          <div className="divide-y divide-border md:hidden">
            {purchases.map((purchase) => {
              const statusBadge = getStatusBadge(purchase.transaction_status);
              const moneyBadge = getMoneyBadge(purchase.money_status);
              const action = getActionButton(purchase.transaction_status);
              const StatusIcon = statusBadge.icon;
              const MoneyIcon = moneyBadge.icon;
              const route = resolveRoute(purchase);
              return (
                <article key={purchase.transaction_id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">#{purchase.transaction_code}</p>
                      <p className="truncate text-sm font-semibold text-foreground">{purchase.item_title}</p>
                      <p className="text-xs text-muted-foreground">{purchase.seller_name} · {format(new Date(purchase.created_at), "MMM d, yyyy")}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-foreground">{formatAmount(purchase.amount, purchase.currency_code)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={`${statusBadge.className} gap-1`}><StatusIcon className="h-3 w-3" />{statusBadge.label}</Badge>
                    <Badge variant="outline" className={`${moneyBadge.className} gap-1`}><MoneyIcon className="h-3 w-3" />{moneyBadge.label}</Badge>
                  </div>
                  <Button className={`min-h-11 w-full ${action.className}`} onClick={() => navigate(route)}>{action.label}</Button>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
                  const route = resolveRoute(purchase);

                  return (
                    <TableRow key={purchase.transaction_id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(route)}>
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
                        <Button
                          size="sm"
                          className={action.className}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(route);
                          }}
                        >
                          {action.label}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
