import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft, Lock, ShieldCheck, Truck, Clock, Package, Star,
  CheckCircle2, Loader2, AlertCircle, Shield, FileText, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { getPublicProductDetail } from "@/services/public-storefront.service";
import { createStorefrontTransaction } from "@/services/storefront-checkout.service";
import { computePricing } from "@/lib/pricing";
import { formatMoney } from "@/lib/format";
import { resolveDeliveryMethod } from "@/lib/status-labels";

const formatPrice = (amount: number, currency: string) => formatMoney(amount, currency);

const StorefrontCheckout = () => {
  const { sellerSlug, productSlug } = useParams<{ sellerSlug: string; productSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quantity = Math.max(1, Number(searchParams.get("qty")) || 1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-product-detail", sellerSlug, productSlug],
    queryFn: () => getPublicProductDetail(sellerSlug!, productSlug!),
    enabled: !!sellerSlug && !!productSlug,
  });

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

  // Pricing
  const itemSubtotal = product.unit_price * quantity;
  const pricing = computePricing(itemSubtotal, product.currency_code);
  const isCapped = pricing.is_capped;
  const isFloored = pricing.is_floored;

  // Primary image
  const images = (product.media || []).filter((m: any) => m.media_type === "image");
  const primaryImage = images.find((m: any) => m.is_primary)?.file_url || images[0]?.file_url;

  // Parse delivery methods
  let deliveryMethods: string[] = [];
  if (product.delivery_method) {
    try {
      deliveryMethods = JSON.parse(product.delivery_method);
    } catch {
      deliveryMethods = [product.delivery_method];
    }
  }
  const primaryDelivery = deliveryMethods[0] || "delivery";

  // Parse agreement terms
  const agreementBullets = product.agreement_terms
    ? product.agreement_terms.split(/\n|;/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const result = await createStorefrontTransaction(product.id, quantity);
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
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {resolveDeliveryMethod(primaryDelivery)}
                    </p>
                    {product.estimated_delivery_days && (
                      <p className="text-sm text-muted-foreground">
                        Estimated {product.estimated_delivery_days} days
                      </p>
                    )}
                  </div>
                </div>
              </div>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Item Subtotal</span>
                  <span className="font-medium text-foreground">
                    {formatPrice(itemSubtotal, product.currency_code)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-muted-foreground">SafeDeal Protection Fee</span>
                    {isCapped && (
                      <Badge variant="outline" className="rounded-full text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                        capped
                      </Badge>
                    )}
                    {isFloored && !isCapped && (
                      <Badge variant="outline" className="rounded-full text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                        min
                      </Badge>
                    )}
                  </div>
                  <span className="font-medium text-foreground">
                    {formatPrice(pricing.service_fee_amount, product.currency_code)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground -mt-1">Non-refundable</p>
                <div className="border-t border-border my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-foreground">Total Amount</span>
                  <span className="text-xl font-bold text-foreground">
                    {formatPrice(pricing.total_amount, product.currency_code)}
                  </span>
                </div>
              </div>
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
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground gap-2 rounded-xl h-12 text-base font-semibold shadow-lg shadow-primary/20"
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
              {isSubmitting ? "Creating Order..." : "Confirm & Continue to Payment"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By confirming, you agree to SafeDeal's{" "}
              <span className="text-primary hover:underline cursor-pointer">Terms of Service</span>
              {" "}and{" "}
              <span className="text-primary hover:underline cursor-pointer">Buyer Protection Policy</span>
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
