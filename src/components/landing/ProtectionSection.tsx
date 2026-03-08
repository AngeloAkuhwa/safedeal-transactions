import { Shield, Lock, Scale, CreditCard, Camera, Users } from "lucide-react";

const protections = [
  {
    icon: Shield,
    title: "Bank-Level Security",
    description: "Your payment information is encrypted with the same technology used by major financial institutions.",
  },
  {
    icon: Lock,
    title: "Immutable Agreement",
    description: "Once payment is made, the transaction details are locked. Neither party can change the terms.",
  },
  {
    icon: Scale,
    title: "Dispute Resolution",
    description: "If something goes wrong, our expert team reviews evidence from both parties to ensure fair outcomes.",
  },
  {
    icon: CreditCard,
    title: "Funds Held Until Verification",
    description: "Your payment is securely held in escrow until you confirm receipt.",
  },
  {
    icon: Camera,
    title: "Evidence-Based Disputes",
    description: "Upload photos and videos if the item doesn't match the agreement.",
  },
  {
    icon: Users,
    title: "Expert Review Team",
    description: "Our specialists review all disputes to ensure fair and accurate resolutions.",
  },
];

export function ProtectionSection() {
  return (
    <section id="protection" className="py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Complete Protection
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Your money stays safe until you're satisfied. SafeDeal holds payments in a secure escrow account.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {protections.map((p) => (
            <div key={p.title} className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">{p.title}</h3>
              <p className="text-sm text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
