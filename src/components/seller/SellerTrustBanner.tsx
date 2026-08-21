import { Shield, Clock } from "lucide-react";

export function SellerTrustBanner() {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-success p-6 sm:p-10">
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />

      {/* `items-center` applies to the cross axis of a column too, which sizes
          these children to their content instead of the available width. The
          stat pair then ran 51px past a 320px screen and `overflow-hidden`
          above quietly ate it. Centre only once this is actually a row. */}
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Transaction terms in one place</h3>
            <p className="text-sm text-white/80">
              Review each transaction's payment, delivery, and release status
            </p>
          </div>
        </div>
        {/* Two `text-2xl` stat cards do not fit one phone line side by side. */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 rounded-xl bg-white/20 px-4 py-3 text-center backdrop-blur-sm sm:flex-none sm:px-5">
            <p className="text-lg font-bold text-white sm:text-2xl">Recorded</p>
            <p className="text-xs text-white/80">Status</p>
          </div>
          <div className="min-w-0 flex-1 rounded-xl bg-white/20 px-4 py-3 text-center backdrop-blur-sm sm:flex-none sm:px-5">
            <div className="flex items-center justify-center gap-1">
              <Clock className="h-4 w-4 shrink-0 text-white" />
              <p className="text-lg font-bold text-white sm:text-2xl">Timestamped</p>
            </div>
            <p className="text-xs text-white/80">Every status change</p>
          </div>
        </div>
      </div>
    </section>
  );
}
