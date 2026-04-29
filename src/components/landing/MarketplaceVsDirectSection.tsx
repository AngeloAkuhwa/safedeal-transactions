import { Link } from "react-router-dom";
import {
  Store,
  Link2,
  ShoppingBag,
  CreditCard,
  PackageCheck,
  Wallet,
  FileText,
  ClipboardCheck,
  ShieldCheck,
  Truck,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success";

interface FlowStep {
  icon: LucideIcon;
  label: string;
}

interface FlowCardProps {
  variant: Tone;
  icon: LucideIcon;
  title: string;
  tagline: string;
  steps: FlowStep[];
  cta: string;
  href: string;
  index: number;
}

const TONE: Record<
  Tone,
  { wrap: string; iconWrap: string; arrow: string; btn: string }
> = {
  primary: {
    wrap: "border-primary/20 bg-gradient-to-br from-primary/5 via-card to-primary/10",
    iconWrap: "bg-primary text-primary-foreground",
    arrow: "text-primary/60",
    btn: "",
  },
  success: {
    wrap: "border-success/20 bg-gradient-to-br from-success/5 via-card to-success/10",
    iconWrap: "bg-success text-success-foreground",
    arrow: "text-success/60",
    btn: "bg-success text-success-foreground hover:bg-success/90",
  },
};

function FlowCard({ variant, icon: Icon, title, tagline, steps, cta, href, index }: FlowCardProps) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = TONE[variant];
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 120}ms` }}
      className={`group flex h-full flex-col rounded-2xl border-2 p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:p-5 ${t.wrap}`}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md ${t.iconWrap}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight text-foreground sm:text-lg">{title}</h3>
          <p className="text-[12px] text-muted-foreground">{tagline}</p>
        </div>
      </div>

      {/* Mini flow — staggered step reveal */}
      <div className="mb-4 flex flex-1 items-stretch gap-1 rounded-xl border border-border bg-card/60 p-2.5 backdrop-blur">
        {steps.map((step, i) => {
          const StepIcon = step.icon;
          return (
            <div key={step.label} className="flex flex-1 items-center gap-1">
              <div
                className="animate-fade-in flex flex-1 flex-col items-center gap-1.5 rounded-lg p-1 transition-transform duration-300 hover:-translate-y-0.5"
                style={{ animationDelay: `${index * 120 + i * 110}ms`, animationFillMode: "both" }}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.iconWrap} transition-transform duration-300 group-hover:scale-110`}
                >
                  <StepIcon className="h-4 w-4" />
                </div>
                <p className="text-center text-[10px] font-bold leading-tight text-foreground">
                  {step.label}
                </p>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className={`h-3 w-3 shrink-0 ${t.arrow}`} />
              )}
            </div>
          );
        })}
      </div>

      <Button
        asChild
        className={`mt-auto h-10 w-full text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${t.btn}`}
      >
        <Link to={href}>
          {cta}
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </Button>
    </div>
  );
}

export function MarketplaceVsDirectSection() {
  return (
    <section className="section-y bg-background">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <h2 className="h-section mb-2 font-bold text-foreground">
            Built for marketplace and direct deals
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Two ways to buy. One protection layer.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
          <FlowCard
            index={0}
            variant="primary"
            icon={Store}
            title="Marketplace Purchase"
            tagline="Buy publicly from verified sellers, fully protected."
            steps={[
              { icon: ShoppingBag, label: "Browse listing" },
              { icon: CreditCard, label: "Pay safely" },
              { icon: Truck, label: "Seller delivers" },
              { icon: PackageCheck, label: "Buyer verifies" },
              { icon: Wallet, label: "Funds release" },
            ]}
            cta="Browse Marketplace"
            href="/marketplace"
          />
          <FlowCard
            index={1}
            variant="success"
            icon={Link2}
            title="Direct Protected Deal"
            tagline="Negotiate privately, then protect the deal with escrow."
            steps={[
              { icon: FileText, label: "Seller creates link" },
              { icon: ClipboardCheck, label: "Buyer reviews terms" },
              { icon: CreditCard, label: "Buyer pays" },
              { icon: ShieldCheck, label: "Deal protected" },
              { icon: Wallet, label: "Funds release" },
            ]}
            cta="Create Protected Deal"
            href="/auth?role=seller&intent=create-transaction"
          />
        </div>
      </div>
    </section>
  );
}
