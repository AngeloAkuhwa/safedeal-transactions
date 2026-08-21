import { useSearchParams, useNavigate, Link } from "react-router";
import { StickyPayBar } from "@/components/payment/StickyPayBar";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Lock, ShieldCheck, Package, Loader2, CheckCircle2, Shield,
  ChevronDown, ChevronUp, Info, Users, CreditCard, Truck, AlertCircle,
  Phone, BadgeCheck, Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { supabase } from "@/integrations/supabase/client";
import { computePricing } from "@/lib/pricing";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import { useEffectivePricingConfigs } from "@/hooks/useEffectivePricingConfig";
import { Skeleton } from "@/components/ui/skeleton";
import { useCommerceGate } from "@/hooks/useCommerceGate";
import { resolveClaim } from "@/lib/trust/trust-claims";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatMoney } from "@/lib/format";
import { PricingBreakdown } from "@/components/payment/PricingBreakdown";
import { viewFromRow } from "@/services/payment-flow.service";
import { PRICING_LINE_LABELS } from "@/lib/payment/payment-labels";
import { FEE_NAME, FEE_CAPTION, REFUND_BULLET } from "@/lib/payment/fee-policy";
import { ProductImage } from "@/components/common/ProductImage";

/**
 * Money in this screen speaks the checkout session's own currency. NEVER
 * default to NGN: the currency is required so a new call site cannot silently
 * mislabel a non-Naira order.
 */
const formatPrice = (amount: number, currency: string) => formatMoney(amount, currency);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ProductInfo {
  id: string;
  title: string;
  short_description: string | null;
  primary_image: string | null;
  stock_quantity: number;
  reserved_quantity: number;
  status: string;
}

interface SellerInfo {
  id: string;
  full_name: string | null;
  store_slug: string | null;
  phone_verified: boolean;
}

async function fetchCheckoutSession(sessionId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("NOT_AUTHENTICATED");

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/checkout-review?session_id=${sessionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }
  );

  const body = await res.json();

  if (!res.ok) {

    const err = new Error(body.error || "Failed to load checkout session");
    (err as any).status = res.status;
    throw err;
  }

  const productMap = new Map<string, ProductInfo>(
    Object.entries(body.products || {})
  );
  const sellerMap = new Map<string, SellerInfo>(
    Object.entries(body.sellers || {})
  );

  return { session: body.session, items: body.items || [], productMap, sellerMap };
}

const GRADIENT_COLORS = [
  "from-primary to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
];

const CartCheckoutReview = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openBreakdowns, setOpenBreakdowns] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["checkout-session", sessionId],
    queryFn: () => fetchCheckoutSession(sessionId!),
    enabled: !!sessionId,
    retry: (failureCount, err: any) => {
      // Don't retry auth/ownership errors
      if (err?.status === 401 || err?.status === 403 || err?.status === 404) return false;
      return failureCount < 2;
    },
  });

  const toggleBreakdown = (sellerId: string) => {
    setOpenBreakdowns((prev) => ({ ...prev, [sellerId]: !prev[sellerId] }));
  };

  const gate = useCommerceGate();
  const gateBlocked = !gate.loading && !gate.checkoutEnabled;

  // HOOK ORDER: every hook must run on every render, including the loading
  // and error renders below. Grouping the items by seller here (rather than
  // after the early returns) keeps the hook count constant.
  const sellerGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const item of data?.items ?? []) {
      const key = item.seller_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [data?.items]);

  const sellerIds = useMemo(() => Array.from(sellerGroups.keys()), [sellerGroups]);
  const { configs: vendorConfigs, loading: pricingConfigLoading } =
    useEffectivePricingConfigs(sellerIds);

  if (!sessionId) {
    return (
      <div className="flex min-h-[100dvh] bg-background">
        <BuyerSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto" />
            <h1 className="text-2xl font-bold">No checkout session</h1>
            <Button onClick={() => navigate("/dashboard/cart")}>Back to Cart</Button>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] bg-background">
        <BuyerSidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (isError || !data?.session) {
    const errMsg = (error as any)?.message || "";
    const errStatus = (error as any)?.status;
    const isAuthError = errStatus === 401 || errMsg === "NOT_AUTHENTICATED";
    const isOwnershipError = errStatus === 403;
    const isNotFound = errStatus === 404;

    let title = "Something went wrong";
    let description = "We couldn't load your checkout session. Please try again.";

    if (isAuthError) {
      title = "Sign in required";
      description = "Please sign in to view your checkout session.";
    } else if (isOwnershipError) {
      title = "Wrong account";
      description = errMsg || "This checkout belongs to a different account. Please sign in with the buyer account that created this checkout.";
    } else if (isNotFound) {
      title = "Session not found";
      description = "This checkout session doesn't exist or may have expired.";
    }

    return (
      <div className="flex min-h-[100dvh] bg-background">
        <BuyerSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md px-4">
            <AlertCircle className="h-16 w-16 text-destructive/50 mx-auto" />
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate("/dashboard/cart")}>Back to Cart</Button>
              {isAuthError && (
                <Button variant="outline" onClick={() => navigate("/auth")}>Sign In</Button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { session, items, productMap, sellerMap } = data;
  const currency: string = session.currency_code;

  const totalItems = items.reduce((sum: number, i: any) => sum + i.quantity, 0);
  const sellerCount = sellerGroups.size;

  const handleConfirmPay = async () => {
    setIsSubmitting(true);
    try {
      const txIds = items.map((i: any) => i.transaction_id).filter(Boolean);
      const { data: txLinks } = await supabase
        .from("transaction_links" as any)
        .select("share_token, transaction_id")
        .in("transaction_id", txIds);

      if (txLinks && txLinks.length > 0) {
        const shareToken = (txLinks[0] as any).share_token;
        toast.success("Redirecting to payment...");
        navigate(`/t/${shareToken}/pay`);
      } else {
        toast.error("No transaction links found");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const glassPanel = "bg-card/60 backdrop-blur-sm border border-border rounded-2xl";

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <BuyerSidebar />
      <main className="flex-1 lg:overflow-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <header className="flex items-center justify-between">
            <button
              onClick={() => navigate("/dashboard/cart")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-11"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Cart
            </button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">Secure Checkout</span>
            </div>
          </header>

          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Review & Pay</h1>
            <p className="text-sm text-muted-foreground mt-1">Review your grouped order before payment</p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              You are making <span className="font-semibold">one payment</span> for multiple seller orders. SafeDeal records each seller order separately.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Package className="h-3.5 w-3.5" />
                Selected Items
              </div>
              <p className="text-xl font-bold text-foreground">{totalItems}</p>
            </div>
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3.5 w-3.5" />
                Seller Groups
              </div>
              <p className="text-xl font-bold text-foreground">{sellerCount}</p>
            </div>
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <CreditCard className="h-3.5 w-3.5" />
                Subtotal
              </div>
              <p className="text-xl font-bold text-foreground">{formatPrice(Number(session.subtotal_amount), currency)}</p>
            </div>
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Shield className="h-3.5 w-3.5" />
                {FEE_NAME}
              </div>
              <p className="text-xl font-bold text-primary">{formatPrice(Number(session.total_protection_fee), currency)}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" />
            SafeDeal calculates the fee separately for each seller order, then combines the amounts into one checkout total.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {Array.from(sellerGroups.entries()).map(([sellerId, sellerItems], idx) => {
                const seller = sellerMap.get(sellerId);
                const sellerName = seller?.full_name || "Unknown Seller";
                const sellerInitial = sellerName.charAt(0).toUpperCase();
                const phoneVerified = seller?.phone_verified ?? false;
                const gradient = GRADIENT_COLORS[idx % GRADIENT_COLORS.length];

                const sellerSubtotal = sellerItems.reduce((sum: number, i: any) => sum + Number(i.line_total), 0);
                // Guard the lookup: an absent vendor config means we do not yet
                // know this seller's effective rates, and platform defaults must
                // never be presented as that vendor's fees.
                const vendorConfig = Object.prototype.hasOwnProperty.call(vendorConfigs, sellerId)
                  ? vendorConfigs[sellerId]
                  : undefined;
                const feesKnown = !pricingConfigLoading && vendorConfig !== undefined;
                const sellerPricing = computePricing(sellerSubtotal, currency, vendorConfig);
                const groupItemCount = sellerItems.reduce((sum: number, i: any) => sum + i.quantity, 0);
                const isOpen = openBreakdowns[sellerId] ?? false;

                return (
                  <div key={sellerId} className={`${glassPanel} overflow-hidden`}>
                    <div className="p-5 flex items-start gap-4">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback className={`bg-gradient-to-br ${gradient} text-white font-bold text-base`}>
                          {sellerInitial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{sellerName}</p>
                          {resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified }) && (
                            <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
                              <Phone className="h-2.5 w-2.5" /> {resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified })}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">A separate transaction will be created for this seller</p>
                        {seller?.store_slug && (
                          <Link
                            to={`/store/${seller.store_slug}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 min-h-11"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Store className="h-3 w-3" />
                            Visit Store
                          </Link>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{groupItemCount} item{groupItemCount !== 1 ? "s" : ""}</p>
                        <p className="text-sm font-semibold text-foreground">{formatPrice(sellerSubtotal, currency)}</p>
                      </div>
                    </div>

                    <div className="px-5 pb-2 divide-y divide-border">
                      {sellerItems.map((item: any) => {
                        const product = productMap.get(item.product_id);
                        const title = product?.title || "Product Item";
                        const desc = product?.short_description || "";
                        const image = product?.primary_image;
                        const stockQty = (product?.stock_quantity ?? 0) - (product?.reserved_quantity ?? 0);
                        const isLowStock = stockQty > 0 && stockQty <= LOW_STOCK_THRESHOLD;

                        return (
                          <div key={item.id} className="flex gap-3 py-3">
                            <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden shrink-0">
                              {image ? (
                                <ProductImage url={image} alt={title} rendition="card" sizes="64px" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  <Package className="h-6 w-6 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{title}</p>
                              {desc && <p className="text-xs text-muted-foreground truncate">{desc}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                                {stockQty > 0 && (
                                  <Badge variant={isLowStock ? "destructive" : "secondary"} className="text-xs px-1.5 py-0">
                                    {isLowStock ? `Low Stock (${stockQty})` : "In Stock"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-foreground">{formatPrice(Number(item.line_total), currency)}</p>
                              <p className="text-xs text-muted-foreground">{formatPrice(Number(item.unit_price), currency)} each</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <Collapsible open={isOpen} onOpenChange={() => toggleBreakdown(sellerId)}>
                      <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3 border-t border-border text-sm hover:bg-muted/50 transition-colors">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5 text-primary" />
                           {FEE_NAME} Breakdown
                        </span>
                        <div className="flex items-center gap-2">
                          {!feesKnown
                            ? <Skeleton className="h-4 w-20" />
                            : <span className="font-semibold text-primary">{formatPrice(sellerPricing.service_fee_amount, currency)}</span>}
                          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-5 pb-4 pt-2 bg-muted/30">
                          {!feesKnown ? (
                            <div className="space-y-2 py-1">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-2/3" />
                              <Skeleton className="h-4 w-1/2" />
                            </div>
                          ) : (
                          <PricingBreakdown
                            snapshot={viewFromRow(
                              {
                                item_amount: sellerSubtotal,
                                platform_fee_amount: sellerPricing.platform_fee_amount,
                                processing_fee_amount: sellerPricing.paystack_fee_amount,
                                service_fee_amount: sellerPricing.service_fee_amount,
                                buyer_total_amount: sellerPricing.total_amount,
                                is_total_service_fee_capped: sellerPricing.is_capped,
                              },
                              { isEstimate: true },
                            )}
                            audience="buyer"
                          />
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </div>

            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-4 space-y-4">
                <div className={`${glassPanel} p-5 space-y-4`}>
                  <h2 className="text-lg font-semibold text-foreground">Payment Summary</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{PRICING_LINE_LABELS.item_amount}</span>
                      <span className="font-medium">{formatPrice(Number(session.subtotal_amount), currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <div>
                        <span className="text-primary font-medium">{PRICING_LINE_LABELS.service_fee_amount}</span>
                        <p className="text-xs text-muted-foreground">{FEE_CAPTION}</p>
                      </div>
                      <span className="font-medium text-primary">{formatPrice(Number(session.total_protection_fee), currency)}</span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between items-end">
                      <span className="font-bold text-foreground">{PRICING_LINE_LABELS.total_amount}</span>
                      <span className="text-2xl font-bold text-foreground">{formatPrice(Number(session.total_amount), currency)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    <span className="font-semibold text-foreground text-sm">Order terms</span>
                  </div>
                  <ul className="space-y-2">
                    {[
                      "Separate transaction record per seller",
                      "Delivery method recorded per order",
                      REFUND_BULLET,
                      "Dispute resolution support",
                    ].map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  size="lg"
                  className="w-full gap-2 rounded-xl h-12 text-base font-semibold bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground shadow-lg shadow-primary/20"
                  onClick={handleConfirmPay}
                  disabled={isSubmitting || gateBlocked}
                  title={gateBlocked ? gate.disabledReason : undefined}
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                  {isSubmitting ? "Processing..." : gateBlocked ? "Checkout unavailable" : `Confirm & Pay ${formatPrice(Number(session.total_amount), currency)}`}
                </Button>
                {/* This route also renders MobileTabBar, so the bar sits above it. */}
                <StickyPayBar
                  total={formatPrice(Number(session.total_amount), currency)}
                  actionLabel={isSubmitting ? "Processing…" : "Pay"}
                  onAction={handleConfirmPay}
                  disabled={isSubmitting || gateBlocked}
                  note={gateBlocked ? gate.disabledReason : undefined}
                  aboveTabBar
                />
                {gateBlocked && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{gate.disabledReason}</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  By confirming, you agree to SafeDeal's{" "}
                  <Link to="/legal/terms" className="text-primary hover:underline">Terms of Service</Link>
                  {" "}and{" "}
                  <Link to="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                  {", including the "}
                  <Link to="/legal/refund-policy" className="text-primary hover:underline">Refund &amp; Dispute Policy</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CartCheckoutReview;
