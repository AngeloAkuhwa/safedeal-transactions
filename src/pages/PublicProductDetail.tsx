import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Shield, ArrowLeft, Package, ShieldCheck, Truck, Clock,
  Heart, Share2, Star, Minus, Plus, Play, BookmarkPlus, MessageCircle,
  CheckCircle2, Lock, FileText, ChevronRight, CircleDot, MapPin, User,
  AlertCircle, ShoppingCart, Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { getPublicProductDetail } from "@/services/public-storefront.service";
import { addToCart, checkInCart } from "@/services/cart.service";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { Footer } from "@/components/landing/Footer";
import { PurchaseAuthModal } from "@/components/storefront/PurchaseAuthModal";
import { useLocation } from "react-router-dom";
import { useIsProductSaved, useToggleSave } from "@/hooks/useSavedProducts";

function formatPrice(amount: number, currency: string) {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString()}`;
  return `${currency} ${Number(amount).toLocaleString()}`;
}

const conditionLabels: Record<string, string> = {
  brand_new: "Brand New",
  like_new: "Like New",
  used_good: "Used - Good",
  used_fair: "Used - Fair",
  refurbished: "Refurbished",
};

const deliveryMethodLabels: Record<string, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
  courier_shipping: "Courier / Shipping",
  digital: "Digital / Instant",
  hand_delivery: "Hand Delivery",
  meetup: "Meetup",
};

// Placeholder reviews data matching reference
const placeholderReviews = [
  {
    id: "1",
    name: "Adebayo Ogunlesi",
    avatar: null,
    rating: 5,
    date: "2 days ago",
    text: "Excellent product! Exactly as described. The SafeDeal escrow gave me confidence to purchase.",
    verified: true,
  },
  {
    id: "2",
    name: "Ngozi Eze",
    avatar: null,
    rating: 4,
    date: "1 week ago",
    text: "Good quality, fast delivery. Would buy again from this seller.",
    verified: true,
  },
];

const PublicProductDetail = () => {
  const { sellerSlug, productSlug } = useParams<{ sellerSlug: string; productSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
          <Link to={isAuthenticated ? "/dashboard/marketplace" : `/store/${sellerSlug}`}>Go Back</Link>
        </Button>
      </div>
    );
  }

  const { product, seller } = data;
  const allMedia = product.media || [];
  const images = allMedia.filter((m: any) => m.media_type === "image");
  const videos = allMedia.filter((m: any) => m.media_type === "video");
  const currentImage = images[selectedImage]?.file_url;

  const handleAddToCart = async () => {
    if (!isAuthenticated) { setShowAuthModal(true); return; }
    setAddingToCart(true);
    try {
      await addToCart(product.id, quantity);
      setInCart(true);
      toast.success("Added to cart!");
    } catch (err: any) { toast.error(err.message); }
    finally { setAddingToCart(false); }
  };

  const handleBuyCTA = () => {
    if (!isAuthenticated) { setShowAuthModal(true); return; }
    if (inCart) { navigate("/dashboard/cart"); return; }
    handleAddToCart();
  };

  const handleAuthGatedAction = (action: () => void) => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    action();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

  const stockStatus = product.stock_quantity === 0
    ? { label: "Out of Stock", cls: "bg-destructive/10 text-destructive border-destructive/20", dot: "bg-destructive" }
    : product.stock_quantity <= 5
    ? { label: `Only ${product.stock_quantity} left`, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", dot: "bg-amber-500" }
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

  const glassPanel = "bg-card/60 backdrop-blur-sm border border-border rounded-2xl";

  const originalPrice = product.original_price && product.original_price > product.unit_price ? product.original_price : null;

  const content = (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 space-y-6 relative z-10">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

      {/* Sticky top bar */}
      <header className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 border-b border-border/50 bg-background/80 backdrop-blur-md h-14 flex items-center justify-between">
        <button
          onClick={() => navigate(isAuthenticated ? "/dashboard/marketplace" : `/store/${sellerSlug}`)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <Heart className={`h-4 w-4 ${isSaved ? "fill-current text-destructive" : "text-muted-foreground"}`} />
          </button>
          <button
            onClick={handleShare}
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to={isAuthenticated ? "/dashboard/marketplace" : "/"} className="hover:text-foreground">Home</Link>
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
              <img
                src={currentImage}
                alt={product.title}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-20 w-20 text-muted-foreground/20" />
              </div>
            )}
          </div>
          {(images.length > 1 || videos.length > 0) && (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img: any, idx: number) => (
                <button
                  key={img.id}
                  onClick={() => { setSelectedImage(idx); setImgError(false); }}
                  className={`aspect-square rounded-xl border-2 overflow-hidden transition-all ${
                    idx === selectedImage ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                  }`}
                >
                  <img src={img.file_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </button>
              ))}
              {videos.map((vid: any) => (
                <button
                  key={vid.id}
                  className="aspect-square rounded-xl border-2 border-border overflow-hidden bg-muted flex items-center justify-center hover:border-primary/40 transition-all"
                  onClick={() => toast.info("Video playback coming soon")}
                >
                  <Play className="h-6 w-6 text-muted-foreground" />
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
              <Badge className="rounded-full text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                {product.category.name}
              </Badge>
            )}
            {product.condition_label && (
              <Badge variant="outline" className="rounded-full text-xs">
                {conditionLabels[product.condition_label] || product.condition_label}
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
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">SafeDeal Escrow Price</p>
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
                <span className="text-xs font-medium text-foreground">Escrow Protected</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-foreground">Verified Seller</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                <Truck className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-foreground">Delivery Support</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                <Clock className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-foreground">{product.verification_window_hours || 48}hr Verification</span>
              </div>
            </div>
          </div>

          {/* Quantity selector — bordered square buttons */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-foreground">Quantity:</span>
            <div className="flex items-center gap-1">
              <button
                className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
              <button
                className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
                onClick={() => setQuantity(Math.min(product.stock_quantity, quantity + 1))}
                disabled={quantity >= product.stock_quantity}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* CTA Button */}
          <Button
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground gap-2 rounded-xl h-12 text-base font-semibold shadow-lg shadow-primary/20"
            onClick={handleBuyCTA}
            disabled={product.stock_quantity === 0 || addingToCart}
          >
            {addingToCart ? <Loader2 className="h-5 w-5 animate-spin" /> : inCart ? <ShoppingCart className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            {addingToCart ? "Adding..." : inCart ? "View in Cart" : "Add to Cart"}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className={`gap-2 rounded-xl h-11 ${glassPanel} !rounded-xl`}
              onClick={() => handleAuthGatedAction(() => {
                toggleSave.mutate({ productId: product.id, saved: !!isSaved });
                toast.success(isSaved ? "Removed from saved" : "Saved for later");
              })}
            >
              <BookmarkPlus className="h-4 w-4" />
              {isSaved ? "Saved" : "Save for Later"}
            </Button>
            <Button
              variant="outline"
              className={`gap-2 rounded-xl h-11 ${glassPanel} !rounded-xl`}
              onClick={() => handleAuthGatedAction(() => toast.info("Contact seller feature coming soon"))}
            >
              <MessageCircle className="h-4 w-4" />
              Contact Seller
            </Button>
          </div>

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
                  {seller.email_verified && <CheckCircle2 className="h-3 w-3 text-primary" />}
                  <span className="text-xs text-muted-foreground">
                    {seller.identity_verified ? "ID Verified Seller" : seller.email_verified ? "Verified Seller" : "Seller"}
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
                    <p className="text-sm font-semibold text-foreground">{deliveryMethodLabels[method] || method}</p>
                    <p className="text-xs text-muted-foreground">Tracked & supported by SafeDeal</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Standard Delivery</p>
                  <p className="text-xs text-muted-foreground">Tracked & supported by SafeDeal</p>
                </div>
              </div>
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
              <span className="text-sm text-muted-foreground">Handled By</span>
              <span className="text-sm font-semibold text-foreground">SafeDeal Escrow</span>
            </div>
          </div>
        </div>

        {/* Customer Reviews */}
        <div className={`${glassPanel} p-5`}>
          <h2 className="text-xl font-bold text-foreground mb-5 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-400" />
            Customer Reviews
          </h2>

          {/* Rating summary — horizontal layout */}
          <div className="flex flex-col sm:flex-row gap-6 pb-5 mb-5 border-b border-border">
            {/* Left: rating number + stars */}
            <div className="flex flex-col items-center justify-center sm:min-w-[140px]">
              <p className="text-5xl font-bold text-foreground mb-1">4.8</p>
              <div className="flex gap-0.5 mb-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={`h-4 w-4 ${i <= 4 ? "fill-amber-400 text-amber-400" : "fill-amber-400/50 text-amber-400/50"}`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Based on 127 reviews</p>
            </div>

            {/* Right: star bars */}
            <div className="flex-1 space-y-2 justify-center flex flex-col">
              {[
                { label: "5 star", pct: 85 },
                { label: "4 star", pct: 12 },
                { label: "3 star", pct: 2 },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-12 shrink-0">{row.label}</span>
                  <Progress value={row.pct} className="flex-1 h-2" />
                  <span className="text-xs text-muted-foreground w-8 text-right">{row.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Individual Reviews */}
          <div className="space-y-4">
            {placeholderReviews.map((review) => (
              <div key={review.id} className="p-4 rounded-xl bg-muted/30 border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {review.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{review.name}</span>
                      {review.verified && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          VERIFIED PURCHASE
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className={`h-3 w-3 ${i <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{review.date}</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{review.text}</p>
              </div>
            ))}
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
      <div className="flex h-screen bg-background overflow-hidden">
        <BuyerSidebar />
        <main className="flex-1 overflow-y-auto relative">
          {content}
        </main>
        {authModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
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
