import { Lock, ShieldCheck, CheckCircle2, Info, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AgreementHeroProps {
  isLocked?: boolean;
}

export function AgreementHero({ isLocked = true }: AgreementHeroProps) {
  if (!isLocked) {
    return (
      <section className="bg-gradient-to-br from-primary/10 via-warning/5 to-background py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_hsl(var(--primary)/0.3)]">
            <Eye className="h-16 w-16 text-primary-foreground" />
          </div>

          <Badge className="bg-warning/10 text-warning border-warning/30 mb-6 px-5 py-2 text-sm font-bold hover:bg-warning/10">
            <Info className="h-4 w-4 mr-2" />
            Payment Pending
          </Badge>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Transaction Agreement Preview
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            This agreement is <span className="font-bold text-warning">not yet locked</span>. The seller may still update details until you complete payment.
          </p>

          <div className="bg-card rounded-2xl shadow-xl border-2 border-warning/20 p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Info className="h-6 w-6 text-warning" />
              <h3 className="text-xl font-bold text-foreground">Agreement Not Yet Final</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Once payment is completed, this agreement becomes permanently locked. No party will be able to modify the
              agreed terms, price, item details, or delivery conditions. Your funds will be held securely in escrow.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-br from-success/10 via-primary/5 to-background py-16 lg:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="w-32 h-32 bg-gradient-to-br from-success to-success/80 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_hsl(var(--success)/0.3)] sd-live-dot">
          <Lock className="h-16 w-16 text-success-foreground" />
        </div>

        <Badge className="bg-success/10 text-success border-success/30 mb-6 px-5 py-2 text-sm font-bold hover:bg-success/10">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Payment Confirmed
        </Badge>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
          Agreement Locked Successfully
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Your payment has been received and the transaction agreement is now{" "}
          <span className="font-bold text-primary">permanently secured</span>. All terms are
          locked to protect both parties.
        </p>

        <div className="bg-card rounded-2xl shadow-xl border-2 border-primary/20 p-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold text-foreground">Anti-Fraud Protection Active</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This transaction is now immutable. No party can modify the agreed terms, price, item
            details, or delivery conditions. Your funds are held securely in escrow until delivery
            confirmation.
          </p>
        </div>
      </div>
    </section>
  );
}