import { Link } from "react-router";
import {
  ShieldCheck, Mail, Phone, MapPin, CreditCard,
  CheckCircle2, Lock, ArrowRight, AlertTriangle, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { VerificationStatus, BuyerPermissions, VerificationLevel } from "@/services/profile.service";
import { formatMoney } from "@/lib/format";
import { resolveClaim } from "@/lib/trust/trust-claims";

interface Props {
  verification: VerificationStatus;
  permissions?: BuyerPermissions;
  hasLocation?: boolean;
  isLoading?: boolean;
  onPhoneVerifyClick?: () => void;
  identitySubmissionStatus?: string | null;
}

const LEVEL_CONFIG: Record<VerificationLevel, { label: string; color: string; bg: string }> = {
  unverified: { label: "Unverified", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
  basic_verified: { label: "Basic Verified", color: "text-success", bg: "bg-success/10 border-success/20" },
  trusted_buyer: { label: "Trusted Buyer", color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  high_trust_buyer: { label: "High-Trust Buyer", color: "text-primary", bg: "bg-primary/10 border-primary/20" },
};

function formatNaira(n: number) {
  if (n >= 999999999) return "Unlimited";
  return formatMoney(n, "NGN");
}

export function AccountVerificationSection({
  verification,
  permissions,
  hasLocation,
  isLoading,
  onPhoneVerifyClick,
  identitySubmissionStatus,
}: Props) {
  const level = verification.verification_level || "unverified";
  const config = LEVEL_CONFIG[level];

  // Progress: email, phone, location
  const steps = [verification.email_verified, verification.phone_verified, !!hasLocation];
  const completedSteps = steps.filter(Boolean).length;
  const progressPercent = Math.round((completedSteps / 3) * 100);

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
          {[1, 2, 3, 4].map((i) => (
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

  // Determine next unlock step messaging
  let unlockMessage = "";
  if (!verification.email_verified) {
    unlockMessage = "Verify your email to begin activation";
  } else if (!verification.phone_verified) {
    unlockMessage = "Verify your phone to unlock protected transactions";
  } else if (!hasLocation) {
    unlockMessage = "Complete your location to activate your account";
  } else if (!verification.identity_verified) {
    unlockMessage = "Complete identity verification to unlock higher limits";
  }

  // Identity status helpers
  const identityStatus = identitySubmissionStatus || null;
  const identityVerified = verification.identity_verified;

  let identityLabel = "Not Started";
  let identityDesc = "Submit identity to unlock higher limits";
  let identityAction: React.ReactNode = (
    <Link to="/dashboard/verification">
      <Button variant="outline" size="sm" className="text-primary border-primary/30">
        Start <ArrowRight className="h-3.5 w-3.5 ml-1" />
      </Button>
    </Link>
  );

  if (identityVerified) {
    identityLabel = "Verified";
    identityDesc = "Identity verified: trusted buyer";
    identityAction = (
      <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verified
      </Badge>
    );
  } else if (identityStatus === "pending_review") {
    identityLabel = "Under Review";
    identityDesc = "Your submission is being reviewed (24-48 hours)";
    identityAction = (
      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
        <Clock className="h-3.5 w-3.5 mr-1" /> Under Review
      </Badge>
    );
  } else if (identityStatus === "rejected" || identityStatus === "more_info_needed") {
    identityLabel = identityStatus === "rejected" ? "Rejected" : "More Info Needed";
    identityDesc = "Please update and resubmit your identity verification";
    identityAction = (
      <Link to="/dashboard/verification">
        <Button variant="outline" size="sm" className="text-destructive border-destructive/30">
          Resubmit <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </Link>
    );
  }

  const items = [
    {
      key: "email",
      label: "Email Verified",
      icon: Mail,
      verified: verification.email_verified,
      description: verification.email_verified ? "Verified" : "Check your inbox to verify",
      actionLabel: undefined as string | undefined,
      onAction: undefined as (() => void) | undefined,
    },
    {
      key: "phone",
      label: resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified: verification.phone_verified }) ?? "Phone number",
      icon: Phone,
      verified: verification.phone_verified,
      description: verification.phone_verified ? "Verified" : "Required for protected transactions",
      actionLabel: verification.phone_verified ? undefined : "Verify Now",
      onAction: verification.phone_verified ? undefined : onPhoneVerifyClick,
    },
    {
      key: "location",
      label: "Location Complete",
      icon: MapPin,
      verified: !!hasLocation,
      description: hasLocation ? "State and LGA saved" : "Select your state and LGA above",
      actionLabel: undefined,
      onAction: undefined,
    },
    {
      key: "identity",
      label: "Identity Verification",
      icon: CreditCard,
      verified: identityVerified,
      description: identityDesc,
      actionLabel: undefined,
      onAction: undefined,
      customAction: identityAction,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Account Verification
          </CardTitle>
          <Badge variant="outline" className={`${config.bg} ${config.color}`}>
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{completedSteps} of 3 activation steps completed</span>
            <span className="font-medium text-foreground">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Unlock messaging */}
        {unlockMessage && level === "unverified" && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Action Required</p>
                <p className="text-xs text-muted-foreground mt-0.5">{unlockMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Limits display */}
        {permissions && (
          <div className="grid grid-cols-2 gap-3">
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

        {/* Region eligibility */}
        {permissions && level !== "unverified" && (
          <div className={`rounded-xl p-3 text-center ${permissions.isRegionEligible ? "bg-success/10 border border-success/20" : "bg-warning/10 border border-warning/20"}`}>
            <p className="text-xs text-muted-foreground">Region Status</p>
            <p className={`text-sm font-bold ${permissions.isRegionEligible ? "text-success" : "text-warning"}`}>
              {permissions.isRegionEligible ? "Eligible (Lagos)" : "Not in active region"}
            </p>
          </div>
        )}

        {/* Verification items */}
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <item.icon className={`h-5 w-5 ${item.verified ? "text-success" : "text-muted-foreground"}`} />
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
              ) : (item as any).customAction ? (
                (item as any).customAction
              ) : item.actionLabel && item.onAction ? (
                <Button variant="outline" size="sm" onClick={item.onAction} className="text-primary border-primary/30">
                  {item.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              ) : (
                <Badge variant="outline" className="text-muted-foreground border-border">
                  Not Verified
                </Badge>
              )}
            </div>
          ))}
        </div>

        {/* Feature lock info */}
        {level === "unverified" && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Features locked</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Complete phone verification and location to unlock: protected payments, disputes, and active purchases.
                </p>
              </div>
            </div>
          </div>
        )}

        {level === "basic_verified" && (
          <div className="space-y-3">
            <div className="pt-2 flex items-center justify-center gap-2 text-success text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Account verified: you can transact up to {permissions?.transactionLimitNaira === null || permissions?.transactionLimitNaira === undefined ? "your account limit" : formatNaira(permissions.transactionLimitNaira)}
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Next level: Trusted Buyer</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Complete identity verification to unlock transactions up to ₦200,000 and 3 concurrent purchases.
                  </p>
                  {!identityVerified && identityStatus !== "pending_review" && (
                    <Link to="/dashboard/verification">
                      <Button variant="outline" size="sm" className="mt-2 text-primary border-primary/30">
                        Start Verification <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
