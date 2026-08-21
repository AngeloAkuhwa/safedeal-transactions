import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Check, Shield, Sparkles, Rocket, Camera, TrendingUp } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPublicVendorPlans,
  formatNaira,
  monthsFreeOnYearly,
  type VendorPlan,
} from "@/services/vendor-plan.service";
import { usePublicPricing } from "@/hooks/usePublicPricing";

const TITLE = "Pricing: Free forever, paid to grow | SafeDeal";

const PLAN_ICONS: Record<string, typeof Shield> = {
  verified: Shield,
  starter: Sparkles,
  growth: Rocket,
};

function planFeatures(plan: VendorPlan, baseRate: number, flatFee: number, baseLine: string): string[] {
  const feats = [
    `Showcase up to ${plan.photo_slots} product photos`,
    plan.escrow_fee_rate < baseRate
      ? `Reduced escrow fee: ${(plan.escrow_fee_rate * 100).toFixed(1)}% + ${formatNaira(flatFee)} per completed deal`
      : `Escrow fee ${baseLine}`,
    "Buyer-protected checkout and escrow",
    "Store page with your real verification status shown",
  ];
  if (plan.featured_placement) feats.push("Featured placement in marketplace search");
  return feats;
}

export default function Pricing() {
  const { copy } = usePublicPricing();
  usePageMeta({ title: TITLE, description: copy.metaDescription, path: "/pricing" });

  const [plans, setPlans] = useState<VendorPlan[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getPublicVendorPlans()
      .then(setPlans)
      .catch(() => setFailed(true));
  }, []);

  const baseRate = copy.platformFeeRate;

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground min-h-11"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to SafeDeal
        </Link>

        <header className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary">Pricing</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Free forever, paid to grow
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            Opening a store, listing products and taking protected payments costs nothing.
            We only earn when you get paid safely.
          </p>
        </header>

        {/* Escrow fee: the one fee everyone pays */}
        <section className="mt-10 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            The only fee on every plan
          </p>
          <p className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">
            {copy.safedealFeeHeadline}
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            per completed deal: capped at {copy.safedealFeeCap}.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{copy.feeDisclosure}</p>
          <p className="mt-2 text-sm text-muted-foreground">{copy.refundLine}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Nigeria pricing shown in ₦. Local pricing announced as each new region goes live.
          </p>
        </section>

        {/* Plans */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Vendor plans</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Plans decide how many products you can showcase at once. And how much of each sale you keep.
          </p>

          {failed && (
            <p className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Plans could not be loaded right now. Please refresh the page.
            </p>
          )}

          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {!plans && !failed &&
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px] rounded-2xl" />)}

            {plans?.map((plan) => {
              const Icon = PLAN_ICONS[plan.code] ?? Shield;
              const isFree = plan.monthly_price_naira === 0;
              const highlight = plan.code === "starter";
              const free = monthsFreeOnYearly(plan);
              return (
                <div
                  key={plan.code}
                  className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg ${
                    highlight ? "border-primary ring-1 ring-primary/30" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-[18px] w-[18px] text-primary" />
                    </span>
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                  </div>
                  {plan.tagline && (
                    <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
                  )}

                  <p className="mt-5 text-3xl font-extrabold">
                    {isFree ? "Free" : formatNaira(plan.monthly_price_naira)}
                    {!isFree && (
                      <span className="text-sm font-medium text-muted-foreground">/month</span>
                    )}
                  </p>
                  {!isFree && plan.yearly_price_naira > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      or {formatNaira(plan.yearly_price_naira)}/year
                      {free > 0 ? `: ${free} month${free === 1 ? "" : "s"} free` : ""}
                    </p>
                  )}

                  <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                    {planFeatures(plan, baseRate, copy.platformFeeFlat, copy.perDealLine).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button asChild className="mt-6 w-full" variant={highlight ? "default" : "outline"}>
                    <Link to={isFree ? "/auth?mode=signup&role=seller" : "/seller/profile?section=plan"}>
                      {isFree ? "Open your free store" : `Choose ${plan.name}`}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sachet add-ons */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Pay-as-you-go add-ons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One-off top-ups when you need a little more, without changing your plan.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Camera className="h-[18px] w-[18px] text-primary" />
                </span>
                <h3 className="font-bold">{copy.photoSlotsAddon.label}</h3>
              </div>
              <p className="mt-3 text-2xl font-extrabold">{copy.photoSlotsAddon.price}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Extra showcase slots added to your store permanently.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="h-[18px] w-[18px] text-primary" />
                </span>
                <h3 className="font-bold">{copy.storeBoostAddon.label}</h3>
              </div>
              <p className="mt-3 text-2xl font-extrabold">{copy.storeBoostAddon.price}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Featured placement in marketplace search for {copy.storeBoostAddon.days} days.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border bg-muted/30 p-6 text-center">
          <p className="text-base font-semibold">We only earn when you get paid safely.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            No listing fees. No setup fees. Cancel a paid plan anytime. It simply runs to the end of
            the period you paid for, then returns to the free Verified plan.
          </p>
          <Button asChild className="mt-5">
            <Link to="/auth?mode=signup&role=seller">Open your free store</Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
