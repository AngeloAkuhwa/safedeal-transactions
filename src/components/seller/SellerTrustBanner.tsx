import { Shield, Clock } from "lucide-react";

export function SellerTrustBanner() {
  return (
    <section className="relative rounded-2xl bg-gradient-to-r from-primary to-success overflow-hidden p-8 sm:p-10">
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />

      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Your transactions are fully protected</h3>
            <p className="text-sm text-white/80">
              All payments are held securely in escrow until buyers verify receipt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold text-white">100%</p>
            <p className="text-xs text-white/80">Protected</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl px-5 py-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Clock className="h-4 w-4 text-white" />
              <p className="text-2xl font-bold text-white">24/7</p>
            </div>
            <p className="text-xs text-white/80">Monitoring</p>
          </div>
        </div>
      </div>
    </section>
  );
}
