import { Link } from "react-router-dom";
import {
  Shield,
  ShoppingBag,
  Store,
  Link2,
  MapPin,
  CheckCircle,
  Truck,
  CircleCheck,
  ShieldCheck,
  ArrowRightLeft,
} from "lucide-react";

const bullets = [
  "Verified sellers",
  "Funds held securely",
  "Buyer confirms before release",
  "Evidence-backed disputes",
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-success/5 py-8 sm:py-10 lg:py-12">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
        <div className="animate-pulse absolute -top-10 left-0 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="animate-pulse absolute -bottom-10 right-0 h-56 w-56 rounded-full bg-success/15 blur-3xl [animation-delay:1s]" />
      </div>

      <div className="container-x relative mx-auto max-w-6xl">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
          {/* Left */}
          <div className="text-center lg:text-left">
            <div className="mb-3 inline-flex animate-fade-in items-center gap-2 rounded-full border border-border bg-card px-3 py-1 shadow-sm">
              <MapPin className="h-3.5 w-3.5 text-success sm:h-4 sm:w-4" />
              <span className="text-[11px] font-semibold text-foreground sm:text-xs">
                Available in Lagos, Nigeria — expanding soon
              </span>
            </div>

            <h1 className="animate-fade-in mb-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] xl:text-[4rem]">
              Buy safely.
              <br />
              <span className="text-primary">Sell confidently.</span>
            </h1>

            <p className="animate-fade-in mx-auto mb-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground lg:mx-0 [animation-delay:80ms]">
              Shop protected deals, buy from verified sellers, and pay with confidence. SafeDeal
              holds your money until you confirm the item matches what was agreed.
            </p>

            {/* Three CTAs — 2-up + full-width on mobile, inline on desktop */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:justify-start">
              <CTA
                to="/marketplace"
                icon={ShoppingBag}
                label="Browse Marketplace"
                variant="primary"
                delay="120ms"
              />
              <CTA
                to="/auth?role=seller"
                icon={Store}
                label="Start Selling"
                variant="success"
                delay="180ms"
              />
              <CTA
                to="/auth?role=seller&intent=create-transaction"
                icon={Link2}
                label="Create Protected Deal"
                variant="dark"
                delay="240ms"
                  />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-foreground sm:text-[13px]">
              {bullets.map((b) => (
                <div
                  key={b}
                  className="animate-fade-in flex items-center gap-2 [animation-delay:320ms]"
                >
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" />
                  <span className="font-medium leading-tight">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Transaction preview card */}
          <div className="relative mx-auto hidden w-full max-w-sm animate-slide-in-right lg:block lg:mx-0 lg:ml-auto">
            <div aria-hidden className="absolute -left-4 -top-4 h-16 w-16 rounded-2xl bg-success/15" />
            <div aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 rounded-2xl bg-primary/15" />

            <div className="relative rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-5">
              <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Transaction #SD-4829</p>
                    <p className="text-[10px] text-muted-foreground">Protected by SafeDeal</p>
                  </div>
                </div>
                <span className="rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success">
                  Protected
                </span>
              </div>

              <ul className="mb-3 space-y-1.5">
                <StatusRow
                  tone="success"
                  icon={CheckCircle}
                  title="Payment Received"
                  subtitle="₦1,450,000 secured"
                />
                <StatusRow
                  tone="warning"
                  icon={ShieldCheck}
                  title="Funds Held"
                  subtitle="Protected in escrow"
                />
                <StatusRow
                  tone="primary"
                  icon={Truck}
                  title="Seller Delivers"
                  subtitle="Expected: Dec 24"
                />
                <StatusRow
                  tone="muted"
                  icon={CircleCheck}
                  title="Buyer Verifies"
                  subtitle="Confirm item matches"
                />
                <StatusRow
                  tone="muted"
                  icon={ArrowRightLeft}
                  title="Funds Released"
                  subtitle="Payment to seller"
                />
              </ul>

              <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-2.5">
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-[12px] font-bold text-foreground">Your payment is protected</p>
                    <p className="text-[10px] text-muted-foreground">
                      Funds released only when you confirm.
                    </p>
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

function CTA({
  to,
  icon: Icon,
  label,
  variant,
  delay,
  className = "",
}: {
  to: string;
  icon: typeof Shield;
  label: string;
  variant: "primary" | "success" | "dark";
  delay: string;
  className?: string;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    success: "bg-success text-success-foreground hover:bg-success/90",
    dark: "bg-foreground text-background hover:bg-foreground/90",
  }[variant];
  return (
    <Link
      to={to}
      style={{ animationDelay: delay, minHeight: "44px" }}
      className={`animate-fade-in inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2.5 text-center text-[11px] font-bold leading-tight shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg sm:gap-2 sm:px-3 sm:text-[13px] lg:px-4 ${styles} ${className}`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

function StatusRow({
  tone,
  icon: Icon,
  title,
  subtitle,
}: {
  tone: "success" | "warning" | "primary" | "muted";
  icon: typeof Shield;
  title: string;
  subtitle: string;
}) {
  const styles = {
    success: {
      wrap: "border-success/30 bg-success/10",
      iconWrap: "bg-success text-success-foreground",
      title: "text-foreground",
      sub: "text-muted-foreground",
    },
    warning: {
      wrap: "border-warning/30 bg-warning/10",
      iconWrap: "bg-warning text-warning-foreground",
      title: "text-foreground",
      sub: "text-muted-foreground",
    },
    primary: {
      wrap: "border-primary/30 bg-primary/10",
      iconWrap: "bg-primary text-primary-foreground",
      title: "text-foreground",
      sub: "text-muted-foreground",
    },
    muted: {
      wrap: "border bg-muted/40",
      iconWrap: "bg-muted text-muted-foreground",
      title: "text-muted-foreground",
      sub: "text-muted-foreground/80",
    },
  }[tone];
  return (
    <li
      className={`flex items-center gap-2 rounded-lg border p-2 transition-all hover:shadow-sm ${styles.wrap}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${styles.iconWrap}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-bold leading-tight ${styles.title}`}>{title}</p>
        <p className={`text-[10px] font-medium leading-tight ${styles.sub}`}>{subtitle}</p>
      </div>
    </li>
  );
}
