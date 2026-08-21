import { ShieldCheck, Mail, Phone, CreditCard, Wallet, MapPin, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SellerVerification, SellerPermissions } from "@/services/seller-profile.service";
import { formatMoney } from "@/lib/format";
import { resolveClaim } from "@/lib/trust/trust-claims";

interface Props {
  verification: SellerVerification;
  permissions?: SellerPermissions;
  isLoading?: boolean;
}

function formatNaira(n: number) {
  if (n >= 999999999) return "Unlimited";
  return formatMoney(n, "NGN");
}

const getItems = (v: SellerVerification) => {
  const payoutDescription = v.payout_verified
    ? "Payout account verified"
    : v.payout_blocker_reason === "no_recipient_code"
      ? "Bank verified: finish linking with our payment processor to receive payouts"
      : v.payout_blocker_reason === "unverified"
        ? "Bank account added but not verified. Re-enter details to verify"
        : "Set up a verified payout account to receive funds";

  return [
  {
    key: "email_verified",
    label: "Email Verified",
    icon: Mail,
    description: v.email_verified ? "Verified" : "Email verification required",
    verified: v.email_verified,
  },
  {
    key: "phone_verified",
    label: resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified: v.phone_verified }) ?? "Phone number",
    icon: Phone,
    description: v.phone_verified ? "Verified" : "Phone verification required",
    verified: v.phone_verified,
  },
  {
    key: "identity_verified",
    label: "Identity Verification",
    icon: CreditCard,
    description: v.identity_verified ? "Identity verified" : "Required for high-value transactions",
    verified: v.identity_verified,
  },
  {
    key: "payout_verified",
    label: "Payout Verification",
    icon: Wallet,
    description: payoutDescription,
    verified: v.payout_verified,
  },
  {
    key: "is_region_eligible",
    label: "Payout Region Support",
    icon: MapPin,
    description: v.is_region_eligible
      ? "Region eligible for protected transactions and payouts."
      : "Buying and selling are available, but payouts are not yet supported in your region.",
    verified: v.is_region_eligible,
  },
  ];
};

export function SellerVerificationSection({ verification, permissions, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Account Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const items = getItems(verification);
  const allVerified = items.every((i) => i.verified);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Account Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Limits display */}
        {permissions && (
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Transaction Limit</p>
              <p className="text-sm font-bold text-foreground">{permissions.transactionLimitNaira === null ? "—" : formatNaira(permissions.transactionLimitNaira)}</p>
            </div>
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Active Transactions</p>
              <p className="text-sm font-bold text-foreground">
                {permissions.activeTransactionCount ?? 0} / {permissions.maxConcurrentActiveTransactions ?? "—"}
              </p>
            </div>
          </div>
        )}

        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <item.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
            {item.verified ? (
              <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-border">
                Not Verified
              </Badge>
            )}
          </div>
        ))}

        {allVerified ? (
          <div className="pt-2 flex items-center justify-center gap-2 text-success text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            All verifications complete
          </div>
        ) : (
          <p className="pt-2 text-xs text-muted-foreground text-center">
            Verification helps protect payouts, dispute handling, and buyer trust.
          </p>
        )}
      </CardContent>
    </Card>
  );
}