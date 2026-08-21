import { Lock, FileText, ShieldCheck } from "lucide-react";
import type { AgreementData } from "@/services/agreement.service";
import { formatMoney } from "@/lib/format";

interface AgreementTrustIndicatorsProps {
  pricing: AgreementData["pricing"];
  /** `transactions.agreement_locked_at`: the only evidence that terms are frozen. */
  lockedAt?: string | null;
}

export function AgreementTrustIndicators({ pricing, lockedAt }: AgreementTrustIndicatorsProps) {
  // `Number(null)` is 0, so a missing total used to render "₦0.00" inside a
  // trust claim. An unknown amount is described, never priced.
  const hasTotal =
    pricing != null && pricing.total_amount != null && Number.isFinite(Number(pricing.total_amount));
  const totalAmount = hasTotal
    ? formatMoney(Number(pricing!.total_amount), pricing!.currency_code)
    : "Your funds";

  const indicators = [
    {
      icon: Lock,
      title: "Payment recorded",
      description: `${totalAmount} follows the transaction's recorded money state`,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    lockedAt
      ? {
          icon: FileText,
          title: "Agreement Locked",
          description: "Terms cannot be changed by any party",
          iconBg: "bg-primary/10",
          iconColor: "text-primary",
        }
      : {
          icon: FileText,
          title: "Agreement not locked yet",
          description: "Terms can still change until the agreement is locked",
          iconBg: "bg-muted",
          iconColor: "text-muted-foreground",
        },
    {
      icon: ShieldCheck,
      title: "Dispute review available",
      description: "Raise a dispute if the item does not match the locked terms",
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
  ];

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div className="grid sm:grid-cols-3 gap-6">
        {indicators.map((ind) => (
          <div
            key={ind.title}
            className="bg-card rounded-xl shadow-lg border border-border p-6 text-center"
          >
            <div
              className={`w-14 h-14 ${ind.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}
            >
              <ind.icon className={`h-7 w-7 ${ind.iconColor}`} />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">{ind.title}</h3>
            <p className="text-sm text-muted-foreground">{ind.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
