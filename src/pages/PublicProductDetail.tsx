import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Shield, ArrowLeft, Package, ShieldCheck, Truck, Clock,
  Heart, Share2, Star, Minus, Plus, BookmarkPlus,
  CheckCircle2, Lock, FileText, ChevronRight, CircleDot, MapPin, User,
  AlertCircle, ShoppingCart, Store, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { getPublicProductDetail } from "@/services/public-storefront.service";
import { addToCart, checkInCart } from "@/services/cart.service";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { Footer } from "@/components/landing/Footer";
import { PurchaseAuthModal } from "@/components/storefront/PurchaseAuthModal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useLocation } from "react-router";
import { useIsProductSaved, useToggleSave } from "@/hooks/useSavedProducts";
import { formatMoney } from "@/lib/format";
import { resolveDeliveryMethod, resolveItemCondition } from "@/lib/status-labels";
import { useCommerceGate } from "@/hooks/useCommerceGate";
import { productShareMetaUrl, openWhatsAppShare } from "@/lib/share-urls";
import { ProductImage } from "@/components/common/ProductImage";
import { Skeleton } from "@/components/ui/skeleton";
import { alwaysClaim, resolveClaim, isTrackedDelivery, sellerVerificationClaim } from "@/lib/trust/trust-claims";

const formatPrice = (amount: number, currency: string) => formatMoney(amount, currency);

const PublicProductDetail = () => {
  const { sellerSlug, productSlug } = useParams<{ sellerSlug: string; productSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(() => {
    const stored = sessionStorage.getItem("safedeal_quantity");
    if (stored) {
      sessionStorage.removeItem("safedeal_quantity");
      const parsed = Number(stored);
      return parsed > 0 ? parsed : 1;
    }
    return 1;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [inCart, setInCart] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-product-detail", sellerSlug, productSlug],
    queryFn: () => getPublicProductDetail(sellerSlug!, productSlug!),
    enabled: !!sellerSlug && !!productSlug,
  });

  const productId = data?.product?.id;
  const { data: isSaved } = useIsProductSaved(productId);
  const toggleSave = useToggleSave();
  const gate = useCommerceGate(data?.seller?.id);
  // Split gating: cart and checkout are independent. Buy Now depends only on
  // checkout; Add to Cart depends only on add_to_cart.
  const cartAllowed = !gate.loading && gate.addToCartEnabled;
  const checkoutAllowed = !gate.loading && gate.checkoutEnabled;

  const metaProduct = data?.product;
  const metaSeller = data?.seller;
  const metaImage =
    (metaProduct?.media || []).find((m: any) => m.media_type === "image")?.file_url ?? null;
  usePageMeta({
    title: `${metaProduct?.title ?? ""} — ${metaSeller?.full_name ?? "SafeDeal"} | SafeDeal`,
    description:
      metaProduct?.short_description ||
      `Buy ${metaProduct?.title ?? "this item"} on SafeDeal. Your payment stays in escrow until you confirm delivery.`,
    path: `/store/${sellerSlug ?? ""}/${productSlug ?? ""}`,
    image: metaImage,
    ogType: "product",
    jsonLd: metaProduct
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: metaProduct.title,
          description: metaProduct.short_description || undefined,
          image: metaImage || undefined,
          brand: metaSeller?.full_name
            ? { "@type": "Brand", name: metaSeller.full_name }
            : undefined,
          offers: {
            "@type": "Offer",
              priceCurrency: metaProduct.currency_code,
            price: metaProduct.unit_price,
            availability:
              Math.max(0, (metaProduct.stock_quantity ?? 0) - (metaProduct.reserved_quantity ?? 0)) > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
          },
        }
      : null,
    enabled: Boolean(metaProduct),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sessData }) => {
      const authed = !!sessData.session;
      setIsAuthenticated(authed);
      if (authed && data?.product?.id) {
        checkInCart(data.product.id).then((res) => setInCart(res.in_cart)).catch(() => {});
      }
    });
  }, [data?.product?.id]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background px-4 py-6">
        <div className="mx-auto max-w-7xl space-y-5"><Skeleton className="h-14 w-full" /><div className="grid gap-8 lg:grid-cols-2"><Skeleton className="aspect-square rounded-lg" /><div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-24 w-full" /><Skeleton className="h-44 w-full" /></div></div></div>
      </div>
    );
  }

  if (isError || !data?.product) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <Package className="h-16 w-16 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold">Product not found</h1>
        <Button asChild>
          <Link to={isAuthenticated ? "/dashboard/marketplace" : `/store/${sellerSlug}`}>Go Back</Link>
        </Button>
      </div>
    );
  }

  const { product, seller } = data;
  const allMedia = product.media || [];
  const images = allMedia.filter((m: any) => m.media_type === "image");
  const currentImage = images[selectedImage]?.file_url;

  const handleAddToCart = async () => {
    if (!isAuthenticated) { setShowAuthModal(true); return; }
    setAddingToCart(true);
    try {
      await addToCart(product.id, quantity);
      setInCart(true);
      queryClient.invalidateQueries({ queryKey: ["buyer-cart"] });
      toast.success("Added to cart!");
    } catch (err: any) { toast.error(err.message); }
    finally { setAddingToCart(false); }
  };

  const handleCartCTA = () => {
    if (!isAuthenticated) { setShowAuthModal(true); return; }
    if (inCart) { navigate("/dashboard/cart"); return; }
    handleAddToCart();
  };

  // Buy Now reuses the existing storefront direct-purchase route exactly —
  // no new endpoint, no alternate pricing path.
  const handleBuyNow = () => {
    if (!isAuthenticated) { setShowAuthModal(true); return; }
    navigate(`/store/${sellerSlug}/${productSlug}/checkout?qty=${quantity}`);
  };

  const handleAuthGatedAction = (action: () => void) => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    action();
  };

  // Copy keeps the clean canonical URL; WhatsApp needs the crawler-friendly
  // share-meta URL so the recipient gets a rich product preview card.
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

  const handleWhatsAppShare = () => {
    if (!sellerSlug || !productSlug) return;
    openWhatsAppShare(
      `${product.title} — protected by SafeDeal escrow:`,
      productShareMetaUrl(sellerSlug, productSlug),
    );
  };

  const availableQty = Math.max(0, (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0));
  const stockStatus = availableQty === 0
    ? { label: "Out of Stock", cls: "bg-destructive/10 text-destructive border-destructive/20", dot: "bg-destructive" }
    : availableQty <= 5
    ? { label: `Only ${availableQty} left`, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", dot: "bg-amber-500" }
    : { label: "In Stock", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", dot: "bg-emerald-500" };

  // Parse agreement terms into titled bullets
  const agreementBullets = product.agreement_terms
    ? product.agreement_terms.split(/\n|;/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  // Parse delivery methods
  let deliveryMethods: string[] = [];
  if (product.delivery_method) {
    try {
      deliveryMethods = JSON.parse(product.delivery_method);
    } catch {
      deliveryMethods = [product.delivery_method];
    }
  }

  const featureHighlights: Array<{ title: string; description: string }> = product.feature_highlights || [];

  const sellerClaim = sellerVerificationClaim({
    identityVerified: seller.identity_verified,
  });
  const trackedDeliveryClaim = resolveClaim("DELIVERY_TRACKED", {
    deliveryMethod: deliveryMethods.find(isTrackedDelivery) ?? null,
  });

  const glassPanel = "bg-card/60 backdrop-blur-sm border border-border rounded-2xl";

  const originalPrice = product.original_price && product.original_price > product.unit_price ? product.original_price : null;

  const content = (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 space-y-6 relative z-10">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

       {/* In-page toolbar is sticky only in the authenticated app shell. Public
           pages already have a sticky global header and must not stack two. */}
       <header className={`${isAuthenticated ? "sticky top-0 z-40" : "relative z-30"} -mx-4 flex min-h-14 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8`}>
        <button
          onClick={() => navigate(isAuthenticated ? "/dashboard/marketplace" : `/store/${sellerSlug}`)}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {isAuthenticated ? "Back to Marketplace" : `Back to ${seller.full_name}'s Store`}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!isAuthenticated) { setShowAuthModal(true); return; }
              toggleSave.mutate({ productId: product.id, saved: !!isSaved });
              toast.success(isSaved ? "Removed from saved" : "Saved for later");
            }}
            className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <Heart className={`h-4 w-4 ${isSaved ? "fill-current text-destructive" : "text-muted-foreground"}`} />
          </button>
          <button
            onClick={handleShare}
            className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="Copy product link"
          >
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleWhatsAppShare}
            className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="Share on WhatsApp"
          >
            <MessageCircle className="h-4 w-4 text-emerald-500" />
          </button>
        </div>
      </header>

      {/* Breadcrumb */}
       <div className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground">
         <Link to={isAuthenticated ? "/dashboard/marketplace" : "/"} className="inline-flex min-h-11 items-center px-1 hover:text-foreground min-w-11 justify-center">Home</Link>
        <ChevronRight className="h-3 w-3" />
        {product.category && (
          <>
            <span className="hover:text-foreground">{product.category.name}</span>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        <span className="text-foreground font-medium truncate max-w-[200px]">{product.title}</span>
      </div>

      {/* Two-column grid — Image + Product Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left — Image Gallery */}
        <div className="space-y-3">
          <div className={`${glassPanel} overflow-hidden aspect-square`}>
            {currentImage && !imgError ? (
              <ProductImage
                url={currentImage}
                alt={product.title}
                rendition="zoom"
                sizes="(max-width: 1024px) 100vw, 600px"
                loading="eager"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-20 w-20 text-muted-foreground/20" />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img: any, idx: number) => (
                <button
                  key={img.id}
                  onClick={() => { setSelectedImage(idx); setImgError(false); }}
                  className={` aspect-square rounded-xl border-2 overflow-hidden transition-all min-h-11 inline-flex items-center ${
                    idx === selectedImage ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                  }`}
                >
                  <ProductImage url={img.file_url} alt="" rendition="thumb" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </button>
              ))}
              
            </div>
          )}
        </div>

        {/* Right — Product Info */}
        <div className="space-y-4">
          {/* Category + Stock inline */}
          <div className="flex items-center gap-2 flex-wrap">
            {product.category && (
              <Badge className="rounded-full bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                {product.category.name}
              </Badge>
            )}
            {product.condition_label && (
              <Badge variant="outline" className="rounded-full text-xs">
                {resolveItemCondition(product.condition_label)}
              </Badge>
            )}
            <Badge variant="outline" className={`rounded-full text-xs ${stockStatus.cls} gap-1.5`}>
              <span className={`h-1.5 w-1.5 rounded-full ${stockStatus.dot}`} />
              {stockStatus.label}
            </Badge>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold text-foreground leading-tight">
            {product.title}
          </h1>

          {product.short_description && (
            <p className="text-muted-foreground text-base">{product.short_description}</p>
          )}

          {/* Pricing card */}
          <div className={`${glassPanel} p-5 space-y-3`}>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Amount held in escrow</p>
              <div className="flex items-baseline gap-3">
                <p className="text-3xl font-bold text-foreground">
                  {formatPrice(product.unit_price, product.currency_code)}
                </p>
                {originalPrice && (
                  <span className="text-base text-muted-foreground line-through">
                    {formatPrice(originalPrice, product.currency_code)}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-medium text-foreground">{alwaysClaim("ESCROW_PROTECTED")}</span>
              </div>
              {sellerClaim && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-medium text-foreground">
                    {sellerClaim}
                  </span>
                </div>
              )}
              {trackedDeliveryClaim && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                  <Truck className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-medium text-foreground">{trackedDeliveryClaim}</span>
                </div>
              )}
              {product.verification_window_hours ? (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-medium text-foreground">
                    {product.verification_window_hours}hr inspection window
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Quantity selector — bordered square buttons */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-foreground">Quantity:</span>
            <div className="flex items-center gap-1">
              <button
                 className="h-11 w-11 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
              <button
                 className="h-11 w-11 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
                onClick={() => setQuantity(Math.min(availableQty, quantity + 1))}
                disabled={quantity >= availableQty}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* CTA Button */}
          {gate.loading ? (
            /* Skeleton instead of a fail-open flash while the gate resolves */
            <div className="space-y-2" data-testid="commerce-cta-skeleton">
              <div className="h-12 w-full rounded-xl bg-muted/50 animate-pulse" />
              <div className="h-11 w-full rounded-xl bg-muted/40 animate-pulse" />
            </div>
          ) : (
            <>
              {(!checkoutAllowed || !cartAllowed) && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1.5" />
                  {!checkoutAllowed ? gate.checkoutDisabledReason : gate.cartDisabledReason}
                </div>
              )}

              {checkoutAllowed && (
                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground gap-2 rounded-xl h-12 text-base font-semibold shadow-lg shadow-primary/20"
                  onClick={handleBuyNow}
                  disabled={availableQty === 0}
                  data-testid="buy-now-button"
                >
                  <ShieldCheck className="h-5 w-5" />
                  Buy Now
                </Button>
              )}

              {cartAllowed && (
                <Button
                  size="lg"
                  variant={checkoutAllowed ? "outline" : "default"}
                  className={
                    checkoutAllowed
                      ? `w-full gap-2 rounded-xl h-12 text-base font-semibold ${glassPanel} !rounded-xl`
                      : "w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground gap-2 rounded-xl h-12 text-base font-semibold shadow-lg shadow-primary/20"
                  }
                  onClick={handleCartCTA}
                  disabled={availableQty === 0 || addingToCart}
                  data-testid="add-to-cart-button"
                >
                  {addingToCart ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
                  {addingToCart ? "Adding..." : inCart ? "View in Cart" : "Add to Cart"}
                </Button>
              )}
            </>
          )}

          <Button
              variant="outline"
              className={`w-full gap-2 rounded-xl h-11 ${glassPanel} !rounded-xl`}
              onClick={() => handleAuthGatedAction(() => {
                toggleSave.mutate({ productId: product.id, saved: !!isSaved });
                toast.success(isSaved ? "Removed from saved" : "Saved for later");
              })}
            >
              <BookmarkPlus className="h-4 w-4" />
              {isSaved ? "Saved" : "Save for Later"}
            </Button>

          {/* Seller Info Card */}
          <div className={`${glassPanel} p-4`}>
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-to-br from-primary to-blue-600 text-white font-bold">
                  {(seller.full_name || "S")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{seller.full_name}</p>
                <div className="flex items-center gap-1.5">
                   {seller.identity_verified && <CheckCircle2 className="h-3 w-3 text-primary" />}
                  <span className="text-xs text-muted-foreground">
                    {sellerClaim ?? "Seller"}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2 rounded-xl"
              onClick={() => navigate(`/store/${sellerSlug}`)}
            >
              <Store className="h-4 w-4" />
              Visit Seller's Store
            </Button>
          </div>
        </div>
      </div>

      {/* Below-the-fold — ALL sections stacked vertically in max-w-4xl */}
      <div className="max-w-4xl space-y-6">
        {/* Product Description */}
        <div className={`${glassPanel} p-5`}>
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Product Description
          </h2>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {product.description}
          </p>

          {/* Feature Highlights grid */}
          {featureHighlights.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Feature Highlights</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {featureHighlights.map((fh: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{fh.title}</p>
                      <p className="text-xs text-muted-foreground">{fh.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fallback brand/model */}
          {featureHighlights.length === 0 && (product.brand || product.model) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {product.brand && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Brand</p>
                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                  </div>
                </div>
              )}
              {product.model && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Model</p>
                    <p className="text-xs text-muted-foreground">{product.model}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product Agreement */}
        {agreementBullets.length > 0 && (
          <div className={`${glassPanel} p-5 border-2 border-primary/20`}>
            <h2 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Product Agreement Details
            </h2>
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 mb-4">
              <p className="text-xs text-primary font-medium flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" />
                By purchasing this item, you agree to the following terms set by the seller.
              </p>
            </div>
            <ul className="space-y-3">
              {agreementBullets.map((item: string, i: number) => {
                const isExclusion = item.toLowerCase().includes("exclusion") || item.toLowerCase().includes("not include") || item.toLowerCase().includes("no refund");
                const colonIdx = item.indexOf(":");
                const hasTitle = colonIdx > 0 && colonIdx < 40;
                return (
                  <li key={i} className="flex items-start gap-2.5">
                    <CircleDot className={`h-4 w-4 shrink-0 mt-0.5 ${isExclusion ? "text-destructive" : "text-primary"}`} />
                    <div className="text-sm">
                      {hasTitle ? (
                        <>
                          <span className="font-semibold text-foreground">{item.substring(0, colonIdx)}</span>
                          <span className="text-muted-foreground">{item.substring(colonIdx)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{item}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Delivery & Fulfillment */}
        <div className={`${glassPanel} p-5`}>
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Delivery & Fulfillment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {deliveryMethods.length > 0 ? (
              deliveryMethods.map((method: string) => (
                <div key={method} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                  {method === "hand_delivery" || method === "meetup" ? (
                    <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-amber-600" />
                    </div>
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{resolveDeliveryMethod(method)}</p>
                    <p className="text-xs text-muted-foreground">
                      {resolveClaim("DELIVERY_TRACKED", { deliveryMethod: method })
                        ?? resolveClaim("DELIVERY_CODE_CONFIRMED", { deliveryMethod: method })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Contact the seller to confirm the available delivery method.</p>
            )}
          </div>

          {/* Delivery detail rows — single card */}
          <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border/50">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-muted-foreground">Delivery Scope</span>
              <span className="text-sm font-semibold text-foreground">{product.delivery_scope || "Contact seller"}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-muted-foreground">Estimated Delivery</span>
              <span className="text-sm font-semibold text-foreground">{product.estimated_delivery_days || "Contact seller"}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-muted-foreground">{alwaysClaim("ESCROW_HANDLER_LABEL")}</span>
              <span className="text-sm font-semibold text-foreground">{alwaysClaim("ESCROW_HANDLER_VALUE")}</span>
            </div>
          </div>
        </div>

        {/* Customer Reviews — real data only. No review system exists yet, so we
            render an honest empty state instead of fabricated ratings. */}
        <div className={`${glassPanel} p-5`}>
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-muted-foreground" />
            Customer Reviews
          </h2>
          <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
            <p className="text-sm font-semibold text-foreground">No reviews yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reviews will appear here after eligible orders are completed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const authModal = (
    <PurchaseAuthModal
      open={showAuthModal}
      onOpenChange={setShowAuthModal}
      product={{
        name: product.title,
        image: images[0]?.file_url || null,
        price: product.unit_price,
        currency: product.currency_code,
      }}
      sellerName={seller.full_name}
      returnPath={location.pathname}
      quantity={quantity}
    />
  );

  if (isAuthenticated) {
    return (
       <div className="flex min-h-[100dvh] bg-background">
        <BuyerSidebar />
         <main className="relative min-w-0 flex-1">
          {content}
        </main>
        {authModal}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-h-11">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-bold text-foreground">SafeDeal</span>
          </Link>
          <Button size="sm" variant="outline" asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </header>
      <main className="flex-1 relative">{content}</main>
      <Footer />
      {authModal}
    </div>
  );
};

export default PublicProductDetail;
