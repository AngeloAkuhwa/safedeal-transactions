import { FileText, CreditCard, Truck, CheckSquare, Shield, Clock } from "lucide-react";

const steps = [
  {
    num: "1",
    icon: FileText,
    title: "Create Transaction",
    description: "Seller creates a protected transaction with item details, price, and delivery terms. Share secure link with buyer.",
    note: "Takes 2 minutes",
  },
  {
    num: "2",
    icon: CreditCard,
    title: "Buyer Pays SafeDeal",
    description: "Buyer reviews the agreement and pays. Funds are held securely in escrow — not released to the seller.",
    note: "Funds held in escrow",
  },
  {
    num: "3",
    icon: Truck,
    title: "Seller Delivers",
    description: "Seller ships the item and uploads delivery proof. SafeDeal holds funds until buyer verification.",
    note: "Photo & video proof required",
  },
  {
    num: "4",
    icon: CheckSquare,
    title: "Buyer Verifies & Funds Release",
    description: "Buyer confirms item matches agreement. SafeDeal releases funds to seller immediately.",
    note: "Transaction complete",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-muted/50 py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            How SafeDeal Works
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            A transparent escrow process that protects both buyers and sellers throughout the transaction.
          </p>
        </div>

        {/* Escrow flow diagram */}
        <div className="mb-10 grid gap-4 sm:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.num} className="relative rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.num}
                </span>
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="mb-2 text-xs text-muted-foreground">{step.description}</p>
              <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {step.note}
              </span>
              {i < steps.length - 1 && (
                <div className="absolute -right-2 top-1/2 hidden h-0.5 w-4 bg-primary/30 sm:block" />
              )}
            </div>
          ))}
        </div>

        {/* Auto-protection note */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-foreground">Automatic Protection Window</h3>
              <p className="text-sm text-muted-foreground">
                If the buyer doesn't respond within the verification window, funds are automatically released to the seller.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
