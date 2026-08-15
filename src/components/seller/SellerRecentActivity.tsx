import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { Link, useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeftRight, Shield, Search, ChevronLeft, ChevronRight, QrCode } from "lucide-react";
import type { SellerActivity } from "@/services/seller-dashboard.service";
import { resolveTransactionLabel } from "@/lib/status-labels";

interface SellerRecentActivityProps {
  activity: SellerActivity[];
}

const TONE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  muted: "secondary",
  info: "default",
  warning: "outline",
  success: "default",
  destructive: "destructive",
};
function statusLabelFor(status: string) {
  const e = resolveTransactionLabel(status, "seller");
  return { label: e.label, variant: TONE_VARIANT[e.tone] };
}

const actionLabels: Record<string, { label: string; variant: "default" | "outline" }> = {
  seller_preparing_delivery: { label: "Update Delivery", variant: "default" },
  seller_dispatched: { label: "View Details", variant: "outline" },
  delivered_awaiting_verification: { label: "View Details", variant: "outline" },
  completed: { label: "View Receipt", variant: "outline" },
  awaiting_buyer: { label: "View Link", variant: "outline" },
  awaiting_payment: { label: "View Details", variant: "outline" },
  payment_secured: { label: "Update Status", variant: "default" },
};

export function SellerRecentActivity({ activity }: SellerRecentActivityProps) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  if (activity.length === 0) {
    return (
      <Card className="rounded-2xl shadow-md">
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

  const filtered = search
    ? activity.filter(
        (r) =>
          r.transaction_code.toLowerCase().includes(search.toLowerCase()) ||
          r.buyer_name.toLowerCase().includes(search.toLowerCase()) ||
          r.item_title.toLowerCase().includes(search.toLowerCase())
      )
    : activity;

  return (
    <Card className="rounded-2xl shadow-md overflow-hidden">
      <CardHeader className="pb-0 pt-5 px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
              <p className="text-sm text-muted-foreground">Your latest transactions and updates</p>
            </div>
            <Button
              variant="link"
              size="sm"
              className="text-primary text-xs"
              onClick={() => navigate("/seller/transactions")}
            >
              View All →
            </Button>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by code, buyer, or item..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 w-full border border-border bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-52"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 mt-4">
        {/* Desktop / tablet table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Transaction</TableHead>
                <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Buyer</TableHead>
                <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Item</TableHead>
                <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const statusInfo = statusLabelFor(row.transaction_status);
                const actionInfo = actionLabels[row.transaction_status] ?? { label: "View Details", variant: "outline" as const };
                return (
                  <TableRow
                    key={row.transaction_id}
                    className="relative sd-row-hover cursor-pointer"
                    onClick={() => navigate(`/seller/transactions/${row.transaction_id}`)}
                  >
                     <TableCell className="px-4 py-3">
                       <div className="flex items-center gap-2">
                         <Shield className="h-4 w-4 text-primary shrink-0" />
                         <Link
                           to={`/seller/transactions/${row.transaction_id}`}
                           onClick={(e) => e.stopPropagation()}
                           className="font-mono text-sm font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                         >
                           {row.transaction_code}
                         </Link>
                       </div>
                     </TableCell>
                     <TableCell className="px-4 py-3">
                       <div>
                         <p className="text-sm font-medium text-foreground">{row.buyer_name}</p>
                         <p className="text-xs text-muted-foreground">{row.buyer_email}</p>
                       </div>
                     </TableCell>
                     <TableCell className="px-4 py-3 hidden lg:table-cell">
                       <p className="text-sm text-foreground truncate max-w-[180px]">{row.item_title}</p>
                     </TableCell>
                     <TableCell className="px-4 py-3 text-sm font-bold tabular-nums">
                       {formatMoney(row.amount, row.currency_code)}
                     </TableCell>
                     <TableCell className="px-4 py-3">
                       <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                     </TableCell>
                     <TableCell className="relative z-rail px-4 py-3">
                       <div className="flex items-center gap-1.5">
                         {row.has_active_rider_token && (
                           <Button
                             variant="outline"
                             size="icon"
                              className="h-11 w-11 shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                             title="Rider confirmation link"
                             onClick={(e) => {
                               e.stopPropagation();
                               navigate(`/seller/transactions/${row.transaction_id}#rider`);
                             }}
                           >
                             <QrCode className="h-4 w-4" />
                           </Button>
                         )}
                         <Button
                           variant={actionInfo.variant === "default" ? "default" : "outline"}
                           size="sm"
                           onClick={(e) => {
                             e.stopPropagation();
                             if (row.transaction_status === "awaiting_buyer") {
                               navigate(`/seller/transactions/${row.transaction_id}/share`);
                             } else if (row.transaction_status === "seller_preparing_delivery") {
                               navigate(`/seller/transactions/${row.transaction_id}/delivery`);
                             } else {
                               navigate(`/seller/transactions/${row.transaction_id}`);
                             }
                           }}
                         >
                           {actionInfo.label}
                         </Button>
                       </div>
                     </TableCell>
                   </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile / small-tablet stacked cards */}
        <div className="md:hidden divide-y">
          {filtered.map((row) => {
            const statusInfo = statusLabelFor(row.transaction_status);
            const actionInfo = actionLabels[row.transaction_status] ?? { label: "View Details", variant: "outline" as const };
            return (
              <div
                key={row.transaction_id}
                className="relative px-4 py-3 sd-row-hover cursor-pointer min-h-11"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                    {/* Stretched link: the row's real, focusable control. */}
                    <Link
                      to={`/seller/transactions/${row.transaction_id}`}
                      aria-label={`Open transaction ${row.transaction_code}`}
                      className="font-mono text-xs font-medium truncate after:absolute after:inset-0 after:content-[''] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.transaction_code}
                    </Link>
                  </div>
                  <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{row.buyer_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{row.buyer_email}</p>
                    <p className="text-xs text-muted-foreground truncate">{row.item_title}</p>
                  </div>
                  <p className="text-sm font-bold text-foreground tabular-nums shrink-0">
                    {formatMoney(row.amount, row.currency_code)}
                  </p>
                </div>
                <div className="relative z-rail flex items-center gap-2">
                  {row.has_active_rider_token && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-primary/30 text-primary hover:bg-primary/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/seller/transactions/${row.transaction_id}#rider`);
                      }}
                    >
                      <QrCode className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant={actionInfo.variant === "default" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (row.transaction_status === "awaiting_buyer") {
                        navigate(`/seller/transactions/${row.transaction_id}/share`);
                      } else if (row.transaction_status === "seller_preparing_delivery") {
                        navigate(`/seller/transactions/${row.transaction_id}/delivery`);
                      } else {
                        navigate(`/seller/transactions/${row.transaction_id}`);
                      }
                    }}
                  >
                    {actionInfo.label}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing 1-{filtered.length} of {activity.length}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
