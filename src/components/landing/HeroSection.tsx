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
    <section className="section-y relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-success/5">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
        <div className="animate-pulse absolute -top-10 left-0 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="animate-pulse absolute -bottom-10 right-0 h-96 w-96 rounded-full bg-success/15 blur-3xl [animation-delay:1s]" />
      </div>

      <div className="container-x relative mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left */}
          <div className="text-center lg:text-left">
            <div className="mb-5 inline-flex animate-fade-in items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-md">
              <MapPin className="h-3.5 w-3.5 text-success sm:h-4 sm:w-4" />
              <span className="text-xs font-semibold text-foreground sm:text-sm">
                Available in Lagos, Nigeria — expanding soon
              </span>
            </div>

            <h1 className="h-display animate-fade-in mb-5 font-extrabold text-foreground">
              Buy safely.
              <br />
              <span className="text-primary">Sell confidently.</span>
            </h1>

            <p className="body-lead animate-fade-in mx-auto mb-7 max-w-xl text-muted-foreground lg:mx-0 [animation-delay:80ms]">
              Shop protected deals, buy from verified sellers, and pay with confidence. SafeDeal
              holds your money until you confirm the item matches what was agreed.
            </p>

            {/* Three CTAs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-start">
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

            <div className="mt-8 grid grid-cols-2 gap-3 text-sm text-foreground">
              {bullets.map((b) => (
                <div
                  key={b}
                  className="animate-fade-in flex items-center gap-2 [animation-delay:320ms]"
                >
                  <CheckCircle className="h-4 w-4 shrink-0 text-success" />
                  <span className="font-medium leading-tight">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Transaction preview card */}
          <div className="relative mx-auto hidden w-full max-w-md animate-slide-in-right lg:block lg:mx-0 lg:ml-auto">
            <div aria-hidden className="absolute -left-6 -top-6 h-24 w-24 rounded-2xl bg-success/15" />
            <div aria-hidden className="absolute -bottom-6 -right-6 h-28 w-28 rounded-2xl bg-primary/15" />

            <div className="relative rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-7">
              <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">Transaction #SD-4829</p>
                    <p className="text-xs text-muted-foreground">Protected by SafeDeal</p>
                  </div>
                </div>
                <span className="rounded-full border border-success/30 bg-success/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-success">
                  Protected
                </span>
              </div>

              <ul className="mb-5 space-y-3.5">
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

              <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4">
                <div className="flex items-start gap-3">
                  <Shield className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Your payment is protected</p>
                    <p className="text-xs text-muted-foreground">
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
}: {
  to: string;
  icon: typeof Shield;
  label: string;
  variant: "primary" | "success" | "dark";
  delay: string;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    success: "bg-success text-success-foreground hover:bg-success/90",
    dark: "bg-foreground text-background hover:bg-foreground/90",
  }[variant];
  return (
    <Link
      to={to}
      style={{ animationDelay: delay }}
      className={`tap-target animate-fade-in inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl sm:text-base ${styles}`}
    >
      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
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
      className={`flex items-start gap-3 rounded-xl border-2 p-3 transition-all hover:shadow-sm ${styles.wrap}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className={`text-sm font-bold ${styles.title}`}>{title}</p>
        <p className={`text-xs font-medium ${styles.sub}`}>{subtitle}</p>
      </div>
    </li>
  );
}
