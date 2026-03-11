import { Shield, Clock } from "lucide-react";

export function SellerTrustBanner() {
  return (
    <section className="rounded-2xl bg-gradient-to-r from-success/15 via-success/10 to-primary/10 border border-success/20 p-8 sm:p-10">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-success/20 flex items-center justify-center">
            <Shield className="h-6 w-6 text-success" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">SafeDeal Protection Active</h3>
            <p className="text-sm text-muted-foreground">
              All your transactions are protected with escrow, verified agreements, and dispute resolution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-success">100%</p>
            <p className="text-xs text-muted-foreground">Protected</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center flex flex-col items-center">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-primary" />
              <p className="text-2xl font-bold text-primary">24/7</p>
            </div>
            <p className="text-xs text-muted-foreground">Monitoring</p>
          </div>
        </div>
      </div>
    </section>
  );
}
