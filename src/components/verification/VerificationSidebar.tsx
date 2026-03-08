import { format } from "date-fns";
import { FileText, User, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WhatHappensCard } from "./WhatHappensCard";
import type { VerificationData } from "@/services/verification.service";

interface VerificationSidebarProps {
  data: VerificationData;
}

const TIMELINE_STEPS = [
  { label: "Transaction Created", key: "created" },
  { label: "Payment Secured", key: "paid" },
  { label: "Delivered", key: "delivered" },
  { label: "Verification In Progress", key: "verifying" },
] as const;

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function VerificationSidebar({ data }: VerificationSidebarProps) {
  const { item, pricing, seller, agreement, transaction } = data;

  return (
    <div className="space-y-4">
      {/* Agreement Snapshot */}
      {agreement && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Locked Agreement</CardTitle>
            </div>
            {agreement.locked_at && (
              <p className="text-xs text-muted-foreground">
                Locked {format(new Date(agreement.locked_at), "MMM dd, yyyy")}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="text-[10px]">
              Immutable Snapshot
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Item Details */}
      {item && pricing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Item Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title</span>
              <span className="font-medium text-foreground text-right max-w-[60%] truncate">
                {item.title}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span className="font-medium text-foreground">{item.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Condition</span>
              <Badge variant="secondary" className="text-[10px]">
                {item.condition_label?.replace(/_/g, " ") || "N/A"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold text-foreground">
                {pricing.currency_code}{" "}
                {Number(pricing.buyer_total_amount).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seller Info */}
      {seller && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Seller</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={seller.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {getInitials(seller.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-foreground">{seller.full_name}</p>
                <Badge variant="secondary" className="text-[10px] mt-0.5">
                  Verified
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {TIMELINE_STEPS.map((step, i) => {
              const isActive = i === TIMELINE_STEPS.length - 1;
              const isDone = i < TIMELINE_STEPS.length - 1;
              return (
                <div key={step.key} className="flex items-center gap-2.5">
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <Circle
                      className={`h-4 w-4 shrink-0 ${isActive ? "text-warning" : "text-muted-foreground"}`}
                    />
                  )}
                  <span
                    className={`text-xs ${isDone ? "text-muted-foreground" : isActive ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* What happens */}
      <WhatHappensCard deadlineAt={transaction.verification_deadline_at} />
    </div>
  );
}
