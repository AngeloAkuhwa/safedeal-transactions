import { Lock, FileText, ShieldCheck } from "lucide-react";
import type { AgreementData } from "@/services/agreement.service";
import { formatMoney } from "@/lib/format";

interface AgreementTrustIndicatorsProps {
  pricing: AgreementData["pricing"];
}

export function AgreementTrustIndicators({ pricing }: AgreementTrustIndicatorsProps) {
  const totalAmount = pricing
    ? formatMoney(Number(pricing.total_amount), pricing.currency_code)
    : "Your funds";

  const indicators = [
    {
      icon: Lock,
      title: "Payment Secured",
      description: `${totalAmount} is safely held in escrow`,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      icon: FileText,
      title: "Agreement Locked",
      description: "Terms cannot be changed by any party",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      icon: ShieldCheck,
      title: "Dispute Ready",
      description: "Full protection if item doesn't match",
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
