import { UserCheck, AlertTriangle, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AccountMeta, SellerVerification } from "@/services/seller-profile.service";
import { format } from "date-fns";

interface Props {
  accountMeta: AccountMeta;
  verification: SellerVerification;
}

export function AccountStatusCard({ accountMeta, verification }: Props) {
  const isActive = accountMeta.account_status === "active";

  const alerts: string[] = [];
  if (!verification.payout_verified) {
    if (verification.payout_blocker_reason === "no_recipient_code") {
      alerts.push("Bank verified: finish the secure payout link to receive payouts.");
    } else if (verification.payout_blocker_reason === "unverified") {
      alerts.push("Bank account added but not verified. Re-enter your details to verify.");
    } else {
      alerts.push("Payout verification pending: set up a verified bank account.");
    }
  }
  if (!verification.is_region_eligible) alerts.push("Your region is not yet eligible for payouts.");
  if (!verification.identity_verified) alerts.push("Identity verification incomplete.");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4 text-primary" />
          Account Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            {isActive ? (
              <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
                Active
              </Badge>
            ) : (
              <Badge variant="destructive">Suspended</Badge>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <span className="text-sm font-medium text-foreground capitalize">{accountMeta.role}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Member Since</span>
            <span className="text-sm text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {accountMeta.member_since
                ? format(new Date(accountMeta.member_since), "MMM yyyy")
                : "—"}
            </span>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="space-y-2 pt-1">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded-lg p-2.5"
              >
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{alert}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
