import { format } from "date-fns";
import {
  FileText,
  Lock,
  Eye,
  User,
  Star,
  CheckCircle2,
  Clock,
  HelpCircle,
  Headphones,
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { VerificationData } from "@/services/verification.service";

interface VerificationSidebarProps {
  data: VerificationData;
}

const TIMELINE_STEPS = [
  { label: "Created", key: "created" },
  { label: "Paid", key: "paid" },
  { label: "Delivered", key: "delivered" },
  { label: "Verification", key: "verifying" },
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function VerificationSidebar({ data }: VerificationSidebarProps) {
  const { item, pricing, seller, agreement, transaction, timeline } = data;

  // Map timeline events to dates
  const timelineDates: Record<string, string> = {};
  if (transaction.created_at) timelineDates.created = transaction.created_at;
  if (timeline?.length) {
    const paidEvent = timeline.find((t) => t.new_status === "payment_secured");
    if (paidEvent) timelineDates.paid = paidEvent.changed_at;
  }
  if (transaction.delivered_at) timelineDates.delivered = transaction.delivered_at;

  return (
    <div className="space-y-6">
      {/* Agreement Snapshot */}
      {agreement && (
        <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Agreement Snapshot</h3>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Locked Agreement</p>
                <p className="text-xs text-muted-foreground">
                  Review what was agreed before payment
                </p>
              </div>
            </div>
          </div>

          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl shadow-lg">
            <Eye className="h-4 w-4 mr-2" />
            View Agreement
          </Button>
        </div>
      )}

      {/* Item Details */}
      {item && pricing && (
        <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
          <h3 className="text-base font-bold text-foreground mb-4">Item Details</h3>

          {/* Image placeholder */}
          <div className="aspect-square bg-muted rounded-xl overflow-hidden mb-4 flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground/40" />
          </div>

          <h4 className="text-base font-bold text-foreground mb-2">{item.title}</h4>
          <p className="text-sm text-muted-foreground mb-4">{item.description}</p>

          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Quantity</span>
              <span className="text-sm font-semibold text-foreground">{item.quantity}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Condition</span>
              <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10 text-xs">
                {item.condition_label?.replace(/_/g, " ") || "N/A"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Price</span>
              <span className="text-sm font-semibold text-foreground">
                {pricing.currency_code}{" "}
                {Number(pricing.buyer_total_amount).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Seller Info */}
      {seller && (
        <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
          <h3 className="text-base font-bold text-foreground mb-4">Seller Information</h3>
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-12 w-12 rounded-xl border-2 border-border">
              <AvatarImage src={seller.avatar_url || undefined} />
              <AvatarFallback className="text-xs rounded-xl">
                {getInitials(seller.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-bold text-foreground">{seller.full_name}</p>
              <p className="text-xs text-muted-foreground">Verified Seller</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs mb-4">
            <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
              <Star className="h-3 w-3 mr-1" />
              4.8
            </Badge>
            <span className="text-muted-foreground">127 transactions</span>
          </div>
          <Button
            variant="outline"
            className="w-full font-semibold py-2.5 rounded-xl text-sm border-2"
          >
            Contact Seller
          </Button>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Quick Timeline</h3>
        </div>

        <div className="space-y-3">
          {TIMELINE_STEPS.map((step, i) => {
            const isActive = i === TIMELINE_STEPS.length - 1;
            const isDone = i < TIMELINE_STEPS.length - 1;
            const dateStr = timelineDates[step.key];
            return (
              <div key={step.key} className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    isDone
                      ? "bg-success/10"
                      : isActive
                        ? "bg-warning/10"
                        : "bg-muted"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Clock
                      className={`h-3.5 w-3.5 ${isActive ? "text-warning" : "text-muted-foreground"}`}
                    />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.label}</p>
                  {isDone && dateStr ? (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(dateStr), "MMM dd, yyyy")}
                    </p>
                  ) : isActive ? (
                    <p className="text-xs text-warning">In Progress</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Need Help */}
      <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl shadow-lg p-6 text-primary-foreground">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="h-6 w-6" />
          <h3 className="text-lg font-bold">Need Help?</h3>
        </div>
        <p className="text-sm opacity-80 mb-4">
          If you're unsure about verification or have questions about the dispute process, our
          support team is here to help.
        </p>
        <Button
          variant="secondary"
          className="w-full bg-card text-primary font-bold py-3 rounded-xl hover:bg-card/90"
        >
          <Headphones className="h-4 w-4 mr-2" />
          Contact Support
        </Button>
      </div>
    </div>
  );
}
