import { ShieldCheck, Ban, Shield, Lock, Check, Lightbulb } from "lucide-react";

export function ImmutabilityExplanation() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl shadow-2xl p-8 lg:p-10 text-primary-foreground">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 bg-primary-foreground/20 backdrop-blur-sm rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h2 className="h-page font-bold mb-2">
              What Does "Agreement Locked" Mean?
            </h2>
            <p className="text-primary-foreground/70 text-base">
              Your transaction is now protected by SafeDeal's immutable agreement system
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          <div className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-5 border border-primary-foreground/20">
            <div className="flex items-center gap-3 mb-3">
              <Ban className="h-5 w-5 text-primary-foreground" />
              <h3 className="text-lg font-bold">Cannot Be Changed</h3>
            </div>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              {[
                "Item details and specifications",
                "Agreed price and payment amount",
                "Product condition and quantity",
                "Delivery terms and timeline",
              ].map((text) => (
                <li key={text} className="flex items-start gap-2">
                  <Lock className="h-3 w-3 text-warning mt-1 shrink-0" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-5 border border-primary-foreground/20">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="h-5 w-5 text-primary-foreground" />
              <h3 className="text-lg font-bold">Protection Activated</h3>
            </div>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              {[
                "Funds held securely in escrow",
                "Seller must deliver exact item agreed",
                "Buyer verification window enforced",
                "Dispute protection available if needed",
              ].map((text) => (
                <li key={text} className="flex items-start gap-2">
                  <Check className="h-3 w-3 text-success mt-1 shrink-0" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-primary-foreground/20 backdrop-blur-sm rounded-xl p-5 border border-primary-foreground/30">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-base font-semibold mb-2">Why This Matters for Your Protection</p>
              <p className="text-sm text-primary-foreground/80 leading-relaxed">
                By locking the agreement after payment, SafeDeal prevents fraud and ensures both
                parties are held to the exact terms agreed upon. The seller cannot substitute items,
                change prices, or modify conditions. If what you receive doesn't match this locked
                agreement, you have full dispute protection with this record as evidence.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
