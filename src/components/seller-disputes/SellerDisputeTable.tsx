import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DisputeStatusBadge } from "@/components/disputes/DisputeStatusBadge";
import { cn } from "@/lib/utils";
import type { SellerDisputeItem } from "@/services/seller-disputes.service";

const moneyImpactConfig: Record<string, { label: string; className: string }> = {
  funds_frozen: { label: "Funds Frozen", className: "bg-destructive/10 text-destructive border-destructive/20" },
  payout_blocked: { label: "Payout Blocked", className: "bg-warning/10 text-warning border-warning/20" },
  refund_pending: { label: "Refund Pending", className: "bg-warning/10 text-warning border-warning/20" },
  no_impact: { label: "No Impact", className: "bg-muted text-muted-foreground border-border" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
}

function formatDeadline(dateStr: string | null) {
  if (!dateStr) return "—";
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
  items: SellerDisputeItem[];
}

export function SellerDisputeTable({ items }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="rounded-2xl shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Txn Code</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider hidden sm:table-cell">Buyer</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Item</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Reason</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Money Impact</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Deadline</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Opened</TableHead>
              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-36">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => {
              const initials = d.buyer?.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() ?? "?";

              const impact = moneyImpactConfig[d.money_impact] ?? moneyImpactConfig.no_impact;

              const deadlineText = d.seller_response_status !== "responded"
                ? formatDeadline(d.seller_response_due_at)
                : "—";

              const isUrgent = d.seller_response_status !== "responded" &&
                d.seller_response_due_at &&
                new Date(d.seller_response_due_at).getTime() - Date.now() < 24 * 60 * 60 * 1000;

              return (
                <TableRow
                  key={d.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/seller/disputes/${d.id}?section=overview`)}
                >
                  <TableCell className="px-4 py-3">
                    <Link
                      to={d.secondary_action.route}
                      className="font-mono text-xs text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.transaction_code ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={d.buyer?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-foreground truncate max-w-[100px]">
                        {d.buyer?.name ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-sm text-foreground truncate max-w-[140px] block">
                      {d.item_title ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">{d.reason_label}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <DisputeStatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="outline" className={cn("text-xs font-medium whitespace-nowrap", impact.className)}>
                      {impact.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 hidden lg:table-cell">
                    <span className={cn("text-xs", isUrgent ? "text-destructive font-semibold" : "text-muted-foreground")}>
                      {deadlineText}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">{formatDate(d.opened_at)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Button
                      variant={d.primary_action.label === "Respond Now" ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        const sectionMap: Record<string, string> = {
                          "Respond Now": "respond",
                          "View Case": "overview",
                          "View Resolution": "resolution",
                        };
                        const sec = sectionMap[d.primary_action.label] ?? "overview";
                        navigate(`/seller/disputes/${d.id}?section=${sec}`);
                      }}
                    >
                      {d.primary_action.label}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
