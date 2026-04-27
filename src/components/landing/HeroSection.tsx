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
import { Button } from "@/components/ui/button";

const bullets = [
  "Verified sellers",
  "Funds held securely",
  "Buyer confirms before release",
  "Evidence-backed disputes",
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-success/5 py-14 sm:py-20 lg:py-24">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -top-10 left-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-10 right-0 h-96 w-96 rounded-full bg-success/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          {/* Left */}
          <div className="text-center lg:text-left">
            <div className="mb-5 inline-flex animate-fade-in items-center gap-2 rounded-full border bg-card px-4 py-1.5 shadow-sm">
              <MapPin className="h-4 w-4 text-success" />
              <span className="text-xs font-semibold text-foreground sm:text-sm">
                Available in Lagos, Nigeria — expanding soon
              </span>
            </div>

            <h1 className="mb-5 animate-fade-in text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
              Buy safely.
              <br />
              <span className="text-primary">Sell confidently.</span>
            </h1>

            <p className="mx-auto mb-7 max-w-xl animate-fade-in text-base text-muted-foreground sm:text-lg lg:mx-0">
              Shop protected deals, buy from verified sellers, and pay with confidence. SafeDeal
              holds your money until you confirm the item matches what was agreed.
            </p>

            {/* Three CTAs */}
            <div className="flex flex-col flex-wrap items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
              <Button size="lg" asChild className="gap-2 shadow-lg">
                <Link to="/marketplace">
                  <ShoppingBag className="h-4 w-4" />
                  Browse Marketplace
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="gap-2 bg-success text-success-foreground shadow-lg hover:bg-success/90"
              >
                <Link to="/auth?role=seller">
                  <Store className="h-4 w-4" />
                  Start Selling
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="gap-2 bg-foreground text-background shadow-lg hover:bg-foreground/90"
              >
                <Link to="/auth?role=seller&intent=create-transaction">
                  <Link2 className="h-4 w-4" />
                  Create Protected Deal
                </Link>
              </Button>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-2.5 text-sm text-foreground sm:grid-cols-2">
              {bullets.map((b) => (
                <div key={b} className="flex items-center justify-center gap-2 lg:justify-start">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="font-medium">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Transaction preview card */}
          <div className="relative mx-auto hidden w-full max-w-md animate-fade-in lg:block lg:mx-0 lg:ml-auto">
            <div className="absolute -left-6 -top-6 h-24 w-24 rounded-2xl bg-success/15" />
            <div className="absolute -bottom-6 -right-6 h-28 w-28 rounded-2xl bg-primary/15" />

            <div className="relative rounded-3xl border bg-card p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">Transaction #SD-4829</p>
                    <p className="text-xs text-muted-foreground">Protected by SafeDeal</p>
                  </div>
                </div>
                <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-success">
                  Protected
                </span>
              </div>

              <ul className="mb-5 space-y-3">
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

              <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
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
