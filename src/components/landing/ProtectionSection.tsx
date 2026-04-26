import { Shield, Lock, FileText, Scale, CheckCircle, Camera, Users } from "lucide-react";

const features = [
  {
    icon: Lock,
    accent: "primary",
    title: "Bank-Level Security",
    description: "Your payment information is encrypted with the same technology used by major financial institutions.",
  },
  {
    icon: FileText,
    accent: "success",
    title: "Immutable Agreement",
    description: "Once payment is made, the transaction details are locked. Neither party can change the terms.",
  },
  {
    icon: Scale,
    accent: "warning",
    title: "Dispute Resolution",
    description: "If something goes wrong, our expert team reviews evidence from both parties to ensure fair outcomes.",
  },
] as const;

const accentBg: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
};

const stripBorder: Record<string, string> = {
  success: "border-l-4 border-success bg-success/5",
  primary: "border-l-4 border-primary bg-primary/5",
  warning: "border-l-4 border-warning bg-warning/5",
};

const stripIcon: Record<string, string> = {
  success: "text-success",
  primary: "text-primary",
  warning: "text-warning",
};

export function ProtectionSection() {
  return (
    <section id="protection" className="bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          {/* Left */}
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-success/10 px-4 py-1.5">
              <Shield className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-semibold text-success">Complete Protection</span>
            </div>
            <h2 className="mb-5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Your money stays safe until you're satisfied
            </h2>
            <p className="mb-8 text-base text-muted-foreground sm:text-lg">
              SafeDeal holds payments in a secure escrow account. Funds are only released when the
              buyer confirms the item matches what was agreed, or after the verification window
              expires.
            </p>

            <div className="space-y-5">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accentBg[f.accent]}`}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="mb-1 text-base font-bold text-foreground sm:text-lg">{f.title}</h4>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — mockup */}
          <div className="relative">
            <div className="rounded-2xl border bg-card p-6 shadow-2xl sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground sm:text-xl">Payment Protection</h3>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                  <Shield className="h-5 w-5 text-success" />
                </div>
              </div>

              <div className="mb-6 space-y-3">
                <div className={`rounded-lg p-4 ${stripBorder.success}`}>
                  <div className="flex items-start gap-3">
                    <CheckCircle className={`mt-0.5 h-5 w-5 shrink-0 ${stripIcon.success}`} />
                    <div>
                      <p className="mb-0.5 font-semibold text-foreground">Funds Held Until Verification</p>
                      <p className="text-sm text-muted-foreground">
                        Your payment is securely held in escrow until you confirm receipt.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 ${stripBorder.primary}`}>
                  <div className="flex items-start gap-3">
                    <Camera className={`mt-0.5 h-5 w-5 shrink-0 ${stripIcon.primary}`} />
                    <div>
                      <p className="mb-0.5 font-semibold text-foreground">Evidence-Based Disputes</p>
                      <p className="text-sm text-muted-foreground">
                        Upload photos and videos if the item doesn't match the agreement.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 ${stripBorder.warning}`}>
                  <div className="flex items-start gap-3">
                    <Users className={`mt-0.5 h-5 w-5 shrink-0 ${stripIcon.warning}`} />
                    <div>
                      <p className="mb-0.5 font-semibold text-foreground">Expert Review Team</p>
                      <p className="text-sm text-muted-foreground">
                        Our specialists review all disputes to ensure fair and accurate resolutions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-gradient-to-r from-primary to-primary/80 p-5 text-primary-foreground">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">₦3.6B+</p>
                    <p className="text-sm text-primary-foreground/80">Protected in transactions</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/20">
                    <Shield className="h-6 w-6" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
