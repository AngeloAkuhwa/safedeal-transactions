import { useParams, useSearchParams, useNavigate, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft, Lock, ShieldCheck, Truck, Clock, Package, Star,
  CheckCircle2, Loader2, AlertCircle, Shield, FileText, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { getPublicProductDetail } from "@/services/public-storefront.service";
import { createStorefrontTransaction } from "@/services/storefront-checkout.service";
import { computePricing } from "@/lib/pricing";
import { useEffectivePricingConfig } from "@/hooks/useEffectivePricingConfig";
import { useCommerceGate } from "@/hooks/useCommerceGate";
import { formatMoney } from "@/lib/format";
import { PricingBreakdown } from "@/components/payment/PricingBreakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { describeFeeBreakdown } from "@/lib/pricing";
import { viewFromRow } from "@/services/payment-flow.service";
import { resolveDeliveryMethod } from "@/lib/status-labels";

const formatPrice = (amount: number, currency: string) => formatMoney(amount, currency);

const StorefrontCheckout = () => {
  const { sellerSlug, productSlug } = useParams<{ sellerSlug: string; productSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Initial quantity is derived from ?qty= once product data (with stock) has loaded; see below for stock clamp.
  const requestedQty = Math.max(1, Number(searchParams.get("qty")) || 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [addrLine1, setAddrLine1] = useState("");
  const [addrLine2, setAddrLine2] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPostal, setAddrPostal] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-product-detail", sellerSlug, productSlug],
    queryFn: () => getPublicProductDetail(sellerSlug!, productSlug!),
    enabled: !!sellerSlug && !!productSlug,
  });

  // Parse delivery methods (must run before any early return so hook order stays stable).
  const deliveryMethods = useMemo<string[]>(() => {
    const dm = data?.product?.delivery_method;
    if (!dm) return [];
    try {
      const parsed = JSON.parse(dm);
      return Array.isArray(parsed) ? parsed : [dm];
    } catch {
      return [dm];
    }
  }, [data?.product?.delivery_method]);

  useEffect(() => {
    if (!selectedMethod && deliveryMethods.length > 0) {
      setSelectedMethod(deliveryMethods[0]);
    }
  }, [deliveryMethods, selectedMethod]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data?.product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <Package className="h-16 w-16 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold">Product not found</h1>
        <Button asChild>
          <Link to={`/store/${sellerSlug}`}>Go Back</Link>
        </Button>
      </div>
    );
  }

  const { product, seller } = data;

  // Clamp requested quantity to available stock (falls back to requested qty if stock is unknown).
  const quantity = typeof product.stock_quantity === "number" && product.stock_quantity > 0
    ? Math.min(requestedQty, product.stock_quantity)
    : requestedQty;

  // Pricing
  const itemSubtotal = product.unit_price * quantity;
  const { config: vendorPricingConfig, loading: pricingConfigLoading } = useEffectivePricingConfig(product.seller_id);
  const gate = useCommerceGate(product.seller_id);
  const gateBlocked = !gate.loading && !gate.checkoutEnabled;
  const pricing = computePricing(itemSubtotal, product.currency_code, vendorPricingConfig);
  const isCapped = pricing.is_capped;
  const isFloored = pricing.is_floored;

  // Primary image
  const images = (product.media || []).filter((m: any) => m.media_type === "image");
  const primaryImage = images.find((m: any) => m.is_primary)?.file_url || images[0]?.file_url;

  const activeMethod = selectedMethod || deliveryMethods[0] || "delivery";
  const needsAddress = activeMethod === "courier_shipping" || activeMethod === "delivery";
  const needsPhone = activeMethod === "pickup" || activeMethod === "meetup" || activeMethod === "hand_delivery";

  // Parse agreement terms
  const agreementBullets = product.agreement_terms
    ? product.agreement_terms.split(/\n|;/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  const handleConfirm = async () => {
    if (!activeMethod) {
      toast.error("Please select a delivery method");
      return;
    }
    if (needsAddress && (!addrLine1.trim() || !addrCity.trim() || !addrState.trim())) {
      toast.error("Please enter your delivery address (line 1, city, state)");
      return;
    }
    if (needsPhone && !contactPhone.trim()) {
      toast.error("Please enter a contact phone number");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createStorefrontTransaction(product.id, quantity, {
        delivery_method: activeMethod,
        delivery_address: needsAddress
          ? {
              line1: addrLine1.trim(),
              line2: addrLine2.trim() || undefined,
              city: addrCity.trim(),
              state: addrState.trim(),
              postal_code: addrPostal.trim() || undefined,
              country_code: "NG",
            }
          : null,
        contact_phone: needsPhone ? contactPhone.trim() : null,
      });
      toast.success("Order created! Redirecting to payment...");
      navigate(`/t/${result.share_token}/pay`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const glassPanel = "bg-card/60 backdrop-blur-sm border border-border rounded-2xl";

  const verificationBadge = seller.verification_level === "trusted_buyer" || seller.verification_level === "high_trust_buyer"
    ? { label: "TRUSTED", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" }
    : seller.verification_level === "basic_verified"
    ? { label: "Verified", cls: "bg-primary/10 text-primary border-primary/20" }
    : null;

  const content = (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4 space-y-6 relative z-10">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />

      {/* Header bar */}
      <header className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/store/${sellerSlug}/${productSlug}`)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Product
        </button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 text-emerald-500" />
          <span className="font-medium">Secure Checkout</span>
        </div>
      </header>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Complete Your Purchase</h1>
        <p className="text-sm text-muted-foreground mt-1">Review your order details and confirm payment</p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - 2/3 */}
        <div className="lg:col-span-2 space-y-5">
          {/* Order Summary */}
          <div className={`${glassPanel} p-5`}>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Order Summary
            </h2>
            <div className="flex gap-4">
              <div className="h-24 w-24 rounded-xl overflow-hidden bg-muted shrink-0">
                {primaryImage ? (
                  <img src={primaryImage} alt={product.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground/20" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <h3 className="font-semibold text-foreground leading-tight">{product.title}</h3>
                {product.short_description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{product.short_description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {product.category && (
                    <Badge className="rounded-full text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                      {product.category.name}
                    </Badge>
                  )}
                  <Badge variant="outline" className="rounded-full text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    In Stock
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-muted-foreground">Qty: {quantity}</span>
                  <span className="font-semibold text-foreground">
                    {formatPrice(itemSubtotal, product.currency_code)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Seller Information */}
          <div className={`${glassPanel} p-5`}>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Seller Information
            </h2>
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                {seller.avatar_url ? (
                  <img src={seller.avatar_url} alt={seller.full_name} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {(seller.full_name || "S").charAt(0).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{seller.full_name}</h3>
                  {verificationBadge && (
                    <Badge variant="outline" className={`rounded-full text-xs ${verificationBadge.cls}`}>
                      {verificationBadge.label}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-medium text-foreground">4.8</span>
                  </div>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">Verified Seller</span>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Method */}
          <div className={`${glassPanel} p-5`}>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Delivery Method
            </h2>
            <div className="space-y-3">
              {deliveryMethods.map((m) => {
                const isActive = m === activeMethod;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMethod(m)}
                    className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${
                      isActive ? "border-primary bg-primary/5" : "border-border bg-transparent hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isActive ? "bg-primary/10" : "bg-muted"}`}>
                        <Truck className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{resolveDeliveryMethod(m)}</p>
                        {product.estimated_delivery_days && (
                          <p className="text-sm text-muted-foreground">Estimated {product.estimated_delivery_days} days</p>
                        )}
                      </div>
                      {isActive && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </div>
                  </button>
                );
              })}
              {needsAddress && (
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Delivery Address
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Address line 1</Label>
                      <Input value={addrLine1} onChange={(e) => setAddrLine1(e.target.value)} placeholder="Street address" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Address line 2 (optional)</Label>
                      <Input value={addrLine2} onChange={(e) => setAddrLine2(e.target.value)} placeholder="Apartment, suite, etc." />
                    </div>
                    <div>
                      <Label className="text-xs">City</Label>
                      <Input value={addrCity} onChange={(e) => setAddrCity(e.target.value)} placeholder="Lagos" />
                    </div>
                    <div>
                      <Label className="text-xs">State</Label>
                      <Input value={addrState} onChange={(e) => setAddrState(e.target.value)} placeholder="Lagos State" />
                    </div>
                    <div>
                      <Label className="text-xs">Postal code (optional)</Label>
                      <Input value={addrPostal} onChange={(e) => setAddrPostal(e.target.value)} placeholder="100001" />
                    </div>
                  </div>
                </div>
              )}
              {needsPhone && (
                <div className="rounded-xl border border-border p-4 space-y-2">
                  <Label className="text-xs">Contact phone</Label>
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+234…"
                    type="tel"
                  />
                  <p className="text-xs text-muted-foreground">The seller will use this number to coordinate {activeMethod === "pickup" ? "pickup" : activeMethod === "meetup" ? "the meetup" : "hand delivery"}.</p>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="rounded-full text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Insured Delivery
                </Badge>
                <Badge variant="outline" className="rounded-full text-xs bg-primary/10 text-primary border-primary/20 gap-1">
                  <MapPin className="h-3 w-3" />
                  Real-time Tracking
                </Badge>
              </div>
            </div>
          </div>

          {/* Purchase Agreement */}
          {agreementBullets.length > 0 && (
            <div className={`${glassPanel} p-5`}>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Purchase Agreement
              </h2>
              <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4">
                <p className="text-sm font-semibold text-foreground mb-3">
                  Terms protected by SafeDeal escrow:
                </p>
                <ul className="space-y-2">
                  {agreementBullets.map((term: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{term}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Right column - 1/3, sticky */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4 space-y-5">
            {/* Payment Summary */}
            <div className={`${glassPanel} p-5`}>
              <h2 className="text-lg font-semibold text-foreground mb-4">Payment Summary</h2>
              {pricingConfigLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : (
                <>
                  <PricingBreakdown
                    snapshot={viewFromRow(
                      {
                        item_amount: itemSubtotal,
                        platform_fee_amount: pricing.platform_fee_amount,
                        processing_fee_amount: pricing.paystack_fee_amount,
                        service_fee_amount: pricing.service_fee_amount,
                        buyer_total_amount: pricing.total_amount,
                        currency_code: product.currency_code,
                        is_total_service_fee_capped: pricing.is_capped,
                      },
                      { isEstimate: true },
                    )}
                    audience="buyer"
                  />
                  {isFloored && !isCapped ? (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Minimum SafeDeal Fee applied.
                    </p>
                  ) : null}
                  <Collapsible className="mt-2">
                    <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="h-3 w-3" />
                      How this fee is calculated
                    </CollapsibleTrigger>
                    <CollapsibleContent className="text-[11px] text-muted-foreground pt-1.5 leading-relaxed">
                      {describeFeeBreakdown({ itemAmount: itemSubtotal, config: vendorPricingConfig }, pricing)}
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </div>

            {/* SafeDeal Protection card */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold text-foreground">SafeDeal Protection</h3>
              </div>
              <ul className="space-y-2.5">
                {[
                  "Funds held in secure escrow until you confirm receipt",
                  `${product.verification_window_hours || 48}-hour verification window after delivery`,
                  "Full refund if item doesn't match description",
                  "Dedicated dispute resolution support",
                ].map((text, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            {gateBlocked && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{gate.disabledReason}</span>
              </div>
            )}
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground gap-2 rounded-xl h-12 text-base font-semibold shadow-lg shadow-primary/20"
              onClick={handleConfirm}
              disabled={isSubmitting || gateBlocked}
              title={gateBlocked ? gate.disabledReason : undefined}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
              {isSubmitting ? "Creating Order..." : gateBlocked ? "Checkout unavailable" : "Confirm & Continue to Payment"}
            </Button>

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
  );

  return (
    <div className="flex min-h-screen bg-background">
      <BuyerSidebar />
      <main className="flex-1 overflow-auto">
        {content}
      </main>
    </div>
  );
};

export default StorefrontCheckout;
