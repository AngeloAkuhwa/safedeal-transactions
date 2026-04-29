import {
  CreditCard,
  Truck,
  CircleCheck,
  ArrowRightLeft,
  AlertTriangle,
  ShieldCheck,
  CheckCircle,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const steps = [
  {
    icon: CreditCard,
    title: "Pay through SafeDeal",
    desc: "Your payment goes to SafeDeal's secure escrow, not directly to the seller.",
  },
  {
    icon: Truck,
    title: "Seller delivers the item",
    desc: "Seller ships and provides delivery confirmation.",
  },
  {
    icon: CircleCheck,
    title: "Buyer confirms it matches",
    desc: "You verify the received item matches the locked agreement.",
  },
  {
    icon: ArrowRightLeft,
    title: "Funds release to seller",
    desc: "Payment released only after your confirmation.",
  },
];

export function ProtectionSection() {
  return (
    <section id="protection" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-7xl">
        <div className="mb-8 text-center sm:mb-12">
          <h2 className="h-section mb-3 font-bold text-foreground">
            Your money stays protected until you're satisfied
          </h2>
          <p className="body-lead mx-auto max-w-3xl text-muted-foreground">
            SafeDeal holds payment securely and releases it only after buyer verification or a
            valid resolution.
          </p>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left — 4 steps + warning */}
          <div className="space-y-5">
            {steps.map((s, i) => (
              <StepRow key={s.title} step={s} index={i} />
            ))}

            <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="mb-0.5 text-sm font-bold text-foreground">
                    Do not pay outside SafeDeal
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Outside payments are not protected by escrow.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right — Transaction card */}
          <ProtectedTransactionCard />
        </div>
      </div>
    </section>
  );
}

function StepRow({
  step,
  index,
}: {
  step: (typeof steps)[number];
  index: number;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  const isLast = index === steps.length - 1;
  const wrap = isLast ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground";
  return (
    <div ref={ref} className="flex items-start gap-3.5 sm:gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${wrap}`}>
        <step.icon className="h-5 w-5" />
      </div>
      <div>
        <h4 className="mb-0.5 text-base font-bold text-foreground sm:text-lg">{step.title}</h4>
        <p className="text-sm text-muted-foreground">{step.desc}</p>
      </div>
    </div>
  );
}

function ProtectedTransactionCard() {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="rounded-3xl border-2 bg-card p-5 shadow-xl sm:p-6">
      <div className="mb-5 flex items-center justify-between border-b pb-4">
        <div>
          <p className="text-sm font-bold text-foreground">Transaction #SD-8472</p>
          <p className="text-xs text-muted-foreground">iPhone 15 Pro Max</p>
        </div>
        <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success">
          Protected
        </span>
      </div>

      <div className="mb-4 space-y-2.5">
        <EscrowRow tone="success" icon={CheckCircle} title="Payment Secured" subtitle="₦1,850,000" />
        <EscrowRow
          tone="warning"
          icon={ShieldCheck}
          title="Funds Held in Escrow"
          subtitle="Protected by SafeDeal"
        />
        <EscrowRow
          tone="primary"
          icon={Truck}
          title="Delivery In Progress"
          subtitle="Expected: Dec 28"
        />
        <EscrowRow
          tone="muted"
          icon={CircleCheck}
          title="Buyer Verification Pending"
          subtitle="Awaiting delivery"
        />
        <EscrowRow
          tone="success"
          icon={CheckCircle}
          title="Funds Released"
          subtitle="₦1,850,000 to seller"
          dimmed
        />
      </div>

      <div className="rounded-2xl bg-primary p-4 text-center">
        <p className="text-xl font-bold text-primary-foreground sm:text-2xl">₦1,850,000</p>
        <p className="text-xs font-medium text-primary-foreground/80">Protected in Escrow</p>
      </div>
    </div>
  );
}

function EscrowRow({
  tone,
  icon: Icon,
  title,
  subtitle,
  dimmed,
}: {
  tone: "success" | "warning" | "primary" | "muted";
  icon: typeof CheckCircle;
  title: string;
  subtitle: string;
  dimmed?: boolean;
}) {
  const styles = {
    success: { wrap: "border-success/30 bg-success/10", icon: "text-success" },
    warning: { wrap: "border-warning/30 bg-warning/10", icon: "text-warning" },
    primary: { wrap: "border-primary/30 bg-primary/10", icon: "text-primary" },
    muted: { wrap: "border bg-muted/40", icon: "text-muted-foreground" },
  }[tone];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all hover:shadow-sm ${styles.wrap} ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${styles.icon}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
