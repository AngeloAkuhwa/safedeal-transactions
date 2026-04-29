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
    <section id="protection" className="section-y bg-muted/30 !py-10 sm:!py-12 lg:!py-14">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <h2 className="h-section mb-2 font-bold text-foreground">
            Your money stays protected until you're satisfied
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            SafeDeal holds payment securely and releases it only after buyer verification or a
            valid resolution.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-8">
          {/* Left — 4 steps + warning */}
          <div className="space-y-3.5">
            {steps.map((s, i) => (
              <StepRow key={s.title} step={s} index={i} />
            ))}

            <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="mb-0.5 text-sm font-bold text-foreground">
                    Do not pay outside SafeDeal
                  </p>
                  <p className="text-[12px] text-muted-foreground">
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
    <div ref={ref} className="flex items-start gap-3" style={{ animationDelay: `${index * 80}ms` }}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${wrap}`}>
        <step.icon className="h-[18px] w-[18px]" />
      </div>
      <div>
        <h4 className="mb-0.5 text-[15px] font-semibold text-foreground sm:text-base">{step.title}</h4>
        <p className="text-[13px] leading-snug text-muted-foreground">{step.desc}</p>
      </div>
    </div>
  );
}

function ProtectedTransactionCard() {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="rounded-2xl border-2 bg-card p-4 shadow-lg lg:ml-auto lg:max-w-[420px]">
      <div className="mb-3 flex items-center justify-between border-b pb-3">
        <div>
          <p className="text-sm font-bold text-foreground">Transaction #SD-8472</p>
          <p className="text-xs text-muted-foreground">iPhone 15 Pro Max</p>
        </div>
        <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success">
          Protected
        </span>
      </div>

      <div className="mb-3 space-y-1.5">
        <EscrowRow index={0} tone="success" icon={CheckCircle} title="Payment Secured" subtitle="₦1,850,000" />
        <EscrowRow
          index={1}
          tone="warning"
          icon={ShieldCheck}
          title="Funds Held in Escrow"
          subtitle="Protected by SafeDeal"
        />
        <EscrowRow
          index={2}
          tone="primary"
          icon={Truck}
          title="Delivery In Progress"
          subtitle="Expected: Dec 28"
        />
        <EscrowRow
          index={3}
          tone="muted"
          icon={CircleCheck}
          title="Buyer Verification Pending"
          subtitle="Awaiting delivery"
        />
        <EscrowRow
          index={4}
          tone="success"
          icon={CheckCircle}
          title="Funds Released"
          subtitle="₦1,850,000 to seller"
          dimmed
        />
      </div>

      <div className="rounded-2xl bg-primary p-3 text-center">
        <p className="text-lg font-bold text-primary-foreground sm:text-xl">₦1,850,000</p>
        <p className="text-xs font-medium text-primary-foreground/80">Protected in Escrow</p>
      </div>
    </div>
  );
}

function EscrowRow({
  index,
  tone,
  icon: Icon,
  title,
  subtitle,
  dimmed,
}: {
  index: number;
  tone: "success" | "warning" | "primary" | "muted";
  icon: typeof CheckCircle;
  title: string;
  subtitle: string;
  dimmed?: boolean;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  const styles = {
    success: { wrap: "border-success/30 bg-success/10", icon: "text-success" },
    warning: { wrap: "border-warning/30 bg-warning/10", icon: "text-warning" },
    primary: { wrap: "border-primary/30 bg-primary/10", icon: "text-primary" },
    muted: { wrap: "border bg-muted/40", icon: "text-muted-foreground" },
  }[tone];
  return (
    <div
      ref={ref}
      style={{ animationDelay: `${index * 90}ms` }}
      className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-all hover:shadow-sm ${styles.wrap} ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <Icon className={`h-[18px] w-[18px] shrink-0 ${styles.icon}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
