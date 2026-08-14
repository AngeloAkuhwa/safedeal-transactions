import { Mail, Phone, ShieldCheck, Info, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { resolveClaim } from "@/lib/trust/trust-claims";

interface BuyerTrustSignals {
  emailVerified?: boolean;
  phoneVerified?: boolean;
  identityVerified?: boolean;
  identitySubmitted?: boolean;
  isFirstTimeBuyer?: boolean;
}

interface Props {
  signals: BuyerTrustSignals;
  compact?: boolean;
}

export function BuyerTrustBadges({ signals, compact }: Props) {
  const badges = [];

  // Email / phone confirmation is a contactability signal, not a trust claim:
  // neutral styling, no shield, no "verified" wording.
  if (signals.emailVerified) {
    badges.push({
      key: "email",
      icon: Mail,
      label: "Email confirmed",
      className: "bg-muted text-muted-foreground border-border",
    });
  }

  if (signals.phoneVerified) {
    badges.push({
      key: "phone",
      icon: Phone,
      label: "Phone confirmed",
      className: "bg-muted text-muted-foreground border-border",
    });
  }

  const identityClaim = resolveClaim("SELLER_ID_VERIFIED", { identityVerified: signals.identityVerified });
  if (identityClaim) {
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
          className={`${b.className} ${compact ? "text-xs px-2 py-0.5" : ""}`}
        >
          <b.icon className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} mr-1`} />
          {b.label}
        </Badge>
      ))}
    </div>
  );
}
