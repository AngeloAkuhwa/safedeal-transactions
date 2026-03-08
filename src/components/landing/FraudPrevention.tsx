import { ShieldAlert, FileWarning, Lock } from "lucide-react";

const cards = [
  {
    icon: Lock,
    title: "Seller cannot change agreement after payment",
    description: "Transaction terms are locked once the buyer pays. No modifications allowed.",
  },
  {
    icon: FileWarning,
    title: "Buyer cannot falsely dispute without evidence",
    description: "All disputes require photo and video evidence reviewed by our expert team.",
  },
  {
    icon: ShieldAlert,
    title: "Funds remain protected during disputes",
    description: "Money stays in escrow until our team makes a fair decision based on evidence.",
  },
];

export function FraudPrevention() {
  return (
    <section className="bg-muted/50 py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Built-in fraud prevention
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Both parties are protected with immutable agreements and evidence-based disputes
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <card.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">{card.title}</h3>
              <p className="text-sm text-muted-foreground">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
