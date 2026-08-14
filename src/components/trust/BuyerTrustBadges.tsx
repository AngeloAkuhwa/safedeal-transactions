import { Mail, Phone, ShieldCheck, Info, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TRUST_CLAIMS } from "@/lib/trust/trust-claims";

interface BuyerTrustSignals {
  emailVerified?: boolean;
  phoneVerified?: boolean;
  identityVerified?: boolean;
  identitySubmitted?: boolean;
  verificationLevel?: string;
  isFirstTimeBuyer?: boolean;
}

interface Props {
  signals: BuyerTrustSignals;
  compact?: boolean;
}

export function BuyerTrustBadges({ signals, compact }: Props) {
  const badges = [];

  if (signals.emailVerified) {
    badges.push({
      key: "email",
      icon: Mail,
      label: "Email Verified",
      className: "bg-success/10 text-success border-success/20",
    });
  }

  if (signals.phoneVerified) {
    badges.push({
      key: "phone",
      icon: Phone,
      label: TRUST_CLAIMS.SELLER_PHONE_VERIFIED.text,
      className: "bg-success/10 text-success border-success/20",
    });
  }

  if (signals.identityVerified) {
    badges.push({
      key: "identity",
      icon: ShieldCheck,
      label: "Identity Verified",
      className: "bg-primary/10 text-primary border-primary/20",
    });
  } else if (signals.identitySubmitted) {
    badges.push({
      key: "identity_submitted",
      icon: Clock,
      label: "Identity Pending Review",
      className: "bg-warning/10 text-warning border-warning/20",
    });
  }

  if (signals.verificationLevel === "basic_verified" || signals.verificationLevel === "trusted_buyer" || signals.verificationLevel === "high_trust_buyer") {
    badges.push({
      key: "verified_buyer",
      icon: ShieldCheck,
      label: signals.verificationLevel === "trusted_buyer" ? "Trusted Buyer" : "Basic Verified Buyer",
      className: signals.verificationLevel === "trusted_buyer"
        ? "bg-primary/10 text-primary border-primary/20"
        : "bg-success/10 text-success border-success/20",
    });
  }

  if (signals.isFirstTimeBuyer) {
    badges.push({
      key: "first_time",
      icon: Info,
      label: "First-Time Buyer",
      className: "bg-warning/10 text-warning border-warning/20",
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "gap-2"}`}>
      {badges.map((b) => (
        <Badge
          key={b.key}
          variant="outline"
          className={`${b.className} hover:${b.className} ${compact ? "text-xs px-2 py-0.5" : ""}`}
        >
          <b.icon className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} mr-1`} />
          {b.label}
        </Badge>
      ))}
    </div>
  );
}
