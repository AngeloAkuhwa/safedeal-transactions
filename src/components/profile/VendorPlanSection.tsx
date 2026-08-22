/**
 * Seller-facing vendor plan panel.
 *
 * Everything here is display + checkout initiation only. The `vendor-plan`
 * edge function prices each purchase from `vendor_plans` and activates it from
 * a verified Paystack payment, so nothing on this screen can grant capacity.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Rocket, Camera, TrendingUp, Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { useVendorPlan } from "@/hooks/useVendorPlan";
import {
  startPlanCheckout,
  verifyPlanPayment,
  formatNaira,
  monthsFreeOnYearly,
  type PurchaseType,
} from "@/services/vendor-plan.service";

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export function VendorPlanSection() {
  const { state, loading, error, refresh } = useVendorPlan();
  const [busy, setBusy] = useState<string | null>(null);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [searchParams, setSearchParams] = useSearchParams();

  // Return leg from Paystack: verify once, then clean the URL.
  useEffect(() => {
    const ref = searchParams.get("reference") ?? searchParams.get("trxref");
    if (!ref || !ref.startsWith("SDPLAN-")) return;
    let cancelled = false;
    verifyPlanPayment(ref)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "paid") toast.success("Payment confirmed: your plan is active.");
        else if (res.status === "pending") toast.info("Payment is still processing. We'll activate it automatically.");
        else toast.error(res.reason ?? "That payment did not complete.");
        void refresh();
      })
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete("reference");
        next.delete("trxref");
        setSearchParams(next, { replace: true });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (purchase_type: PurchaseType, plan_code?: string) => {
    const key = plan_code ?? purchase_type;
    setBusy(key);
    try {
      const { authorization_url } = await startPlanCheckout({
        purchase_type,
        plan_code,
        billing_period: purchase_type === "plan" ? period : undefined,
        callback_url: `${window.location.origin}/seller/profile?section=plan`,
      });
      window.location.href = authorization_url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your plan…
        </div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{error ?? "Plan details unavailable."}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  const current = state.plans.find((p) => p.code === state.current.plan_code);
  const slots = state.showcase_slots;
  const pct = slots.limit > 0 ? Math.min(100, Math.round((slots.used / slots.limit) * 100)) : 0;
  const boostedUntil = formatDate(state.current.featured_until);
  const boostActive = !!state.current.featured_until && new Date(state.current.featured_until) > new Date();

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Rocket className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Plan & showcase slots</h2>
          <p className="text-xs text-muted-foreground">
            Free forever to sell: upgrade only when you want to showcase more.
          </p>
        </div>
        <Badge variant="secondary">{current?.name ?? state.current.plan_code}</Badge>
      </div>

      <div className="space-y-5 p-4">
        {/* Current usage */}
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-foreground">Showcase slots</span>
            <span className="text-muted-foreground">
              {slots.used} of {slots.limit} used
            </span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {slots.remaining > 0
              ? `${slots.remaining} slot${slots.remaining === 1 ? "" : "s"} left for new product photos.`
              : "All slots are in use. Add slots or upgrade to publish more product photos."}
            {state.current.extra_photo_slots > 0 &&
              ` Includes ${state.current.extra_photo_slots} purchased extra slot${state.current.extra_photo_slots === 1 ? "" : "s"}.`}
          </p>
          {state.current.expires_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Your {current?.name} plan runs until {formatDate(state.current.expires_at)}.
            </p>
          )}
        </div>

        {/* Plans */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Change plan</span>
            <div className="flex rounded-lg border border-border p-0.5">
              {(["monthly", "yearly"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  } min-h-11 min-w-11 justify-center`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {state.plans.map((plan) => {
              const isCurrent = plan.code === state.current.plan_code;
              const price = period === "yearly" ? plan.yearly_price_naira : plan.monthly_price_naira;
              const free = monthsFreeOnYearly(plan);
              return (
                <div
                  key={plan.code}
                  className={`rounded-lg border p-3 ${isCurrent ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{plan.name}</span>
                    {isCurrent && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-1 text-lg font-bold text-foreground">
                    {price === 0 ? "Free" : formatNaira(price)}
                    {price > 0 && (
                      <span className="text-xs font-medium text-muted-foreground">
                        /{period === "yearly" ? "yr" : "mo"}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.photo_slots} showcase slots
                    {plan.escrow_fee_rate < 0.02 ? ` · ${(plan.escrow_fee_rate * 100).toFixed(1)}% escrow fee` : ""}
                    {plan.featured_placement ? " · featured placement" : ""}
                    {period === "yearly" && free > 0 ? ` · ${free} month${free === 1 ? "" : "s"} free` : ""}
                  </p>
                  <Button
                    size="sm"
                    variant={isCurrent ? "secondary" : "default"}
                    className="mt-3 w-full"
                    disabled={isCurrent || price === 0 || busy !== null}
                    onClick={() => void buy("plan", plan.code)}
                  >
                    {busy === plan.code ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isCurrent ? (
                      "Current plan"
                    ) : price === 0 ? (
                      "Free plan"
                    ) : (
                      "Upgrade"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sachets */}
        <div>
          <span className="text-sm font-medium text-foreground">Add-ons</span>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {state.sachets.photo_slots.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Adds {state.sachets.photo_slots.slots} permanent showcase slots.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                disabled={busy !== null}
                onClick={() => void buy("photo_slots")}
              >
                {busy === "photo_slots" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  `Buy for ${formatNaira(state.sachets.photo_slots.amount_naira)}`
                )}
              </Button>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {state.sachets.store_boost.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {boostActive
                  ? `Featured in marketplace search until ${boostedUntil}.`
                  : `Featured placement in marketplace search for ${state.sachets.store_boost.days} days.`}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                disabled={busy !== null}
                onClick={() => void buy("store_boost")}
              >
                {busy === "store_boost" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Star className="h-3.5 w-3.5" />
                    {boostActive ? "Extend boost" : "Boost my store"} · {formatNaira(state.sachets.store_boost.amount_naira)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* History */}
        {state.purchases.length > 0 && (
          <div>
            <span className="text-sm font-medium text-foreground">Recent purchases</span>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {state.purchases.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="text-foreground">
                    {p.purchase_type === "plan"
                      ? `${p.plan_code} plan (${p.billing_period})`
                      : p.purchase_type === "photo_slots"
                        ? "+10 photo slots"
                        : "Store boost"}
                  </span>
                  <span className="text-muted-foreground">{formatNaira(p.amount_naira)}</span>
                  <Badge variant={p.status === "paid" ? "secondary" : "outline"}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          We only earn when you get paid safely. Plans are optional. Selling on SafeDeal is free.
        </p>
      </div>
    </div>
  );
}
