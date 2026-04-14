import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, Shield, ArrowLeft, Package, ShieldCheck, Truck, Clock,
  Heart, Share2, Star, Minus, Plus, Play, BookmarkPlus, MessageCircle,
  CheckCircle2, Lock, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { getPublicProductDetail } from "@/services/public-storefront.service";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { Footer } from "@/components/landing/Footer";

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

const PublicProductDetail = () => {
  const { sellerSlug, productSlug } = useParams<{ sellerSlug: string; productSlug: string }>();
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [liked, setLiked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });
  }, []);

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

  const sellerInitials = seller.full_name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleBuyCTA = () => {
    toast.info("Purchase flow coming soon! Contact the seller directly for now.", { duration: 4000 });
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

  const stockStatus = product.stock_quantity === 0
    ? { label: "Out of Stock", cls: "bg-destructive/10 text-destructive border-destructive/20" }
    : product.stock_quantity <= 5
    ? { label: `Only ${product.stock_quantity} left`, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" }
    : { label: "In Stock", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };

  const agreementBullets = product.agreement_terms
    ? product.agreement_terms.split(/\n|;/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  const glassPanel = "bg-card/60 backdrop-blur-sm border border-border rounded-[24px]";

  const content = (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8 relative z-10">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(isAuthenticated ? "/dashboard/marketplace" : `/store/${sellerSlug}`)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {isAuthenticated ? "Back to Marketplace" : `Back to ${seller.full_name}'s Store`}
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => setLiked(!liked)}
          >
            <Heart className={`h-5 w-5 ${liked ? "fill-current text-destructive" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={handleShare}>
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to={isAuthenticated ? "/dashboard/marketplace" : "/"} className="hover:text-foreground">Home</Link>
        <span>/</span>
        {product.category && (
          <>
            <span className="hover:text-foreground">{product.category.name}</span>
            <span>/</span>
          </>
        )}
        <span className="text-foreground font-medium truncate max-w-[200px]">{product.title}</span>
      </div>

      {/* Two-column grid */}
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
                  className={`aspect-square rounded-xl border-2 overflow-hidden ${
                    idx === selectedImage ? "border-primary" : "border-border"
                  }`}
                >
                  <img
                    src={img.file_url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "";
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </button>
              ))}
              {videos.map((vid: any) => (
                <button
                  key={vid.id}
                  className="aspect-square rounded-xl border-2 border-border overflow-hidden bg-muted flex items-center justify-center"
                  onClick={() => toast.info("Video playback coming soon")}
                >
                  <Play className="h-6 w-6 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — Product Info */}
        <div className="space-y-5">
          {/* Category + Stock */}
          <div className="flex items-center gap-2 flex-wrap">
            {product.category && (
              <Badge variant="outline" className="rounded-full text-xs">
                {product.category.name}
              </Badge>
            )}
            {product.condition_label && (
              <Badge variant="outline" className="rounded-full text-xs">
                {conditionLabels[product.condition_label] || product.condition_label}
              </Badge>
            )}
            <Badge variant="outline" className={`rounded-full text-xs ${stockStatus.cls}`}>
              {stockStatus.label}
            </Badge>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {product.title}
          </h1>

          {product.short_description && (
            <p className="text-muted-foreground">{product.short_description}</p>
          )}

          {/* Seller mini-card */}
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={seller.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">{sellerInitials}</AvatarFallback>
            </Avatar>
            <div>
              <Link to={`/store/${sellerSlug}`} className="text-sm font-medium hover:underline">
                {seller.full_name}
              </Link>
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-emerald-500" />
                <span className="text-xs text-emerald-500">
                  {seller.verification_level === "trusted_buyer" ? "Trusted Seller" : seller.verification_level === "basic_verified" ? "Verified" : "Seller"}
                </span>
              </div>
            </div>
          </div>

          {/* Pricing card */}
          <div className={`${glassPanel} p-5 space-y-4`}>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">SafeDeal Escrow Price</p>
              <p className="text-3xl font-bold text-foreground">
                {formatPrice(product.unit_price, product.currency_code)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Escrow Protected</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>Verified Seller</span>
              </div>
              {product.delivery_method && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Truck className="h-4 w-4 text-primary shrink-0" />
                  <span>{product.delivery_method}</span>
                </div>
              )}
              {product.verification_window_hours && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span>{product.verification_window_hours}h Verification</span>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Qty:</span>
              <div className="flex items-center border border-border rounded-lg">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.min(product.stock_quantity, quantity + 1))}
                  disabled={quantity >= product.stock_quantity}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <Button
            size="lg"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            onClick={handleBuyCTA}
            disabled={product.stock_quantity === 0}
          >
            <ShieldCheck className="h-5 w-5" />
            Buy with SafeDeal Protection
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2" onClick={() => { setLiked(!liked); toast.success(liked ? "Removed from saved" : "Saved for later"); }}>
              <BookmarkPlus className="h-4 w-4" />
              Save for Later
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => toast.info("Contact seller feature coming soon")}>
              <MessageCircle className="h-4 w-4" />
              Contact Seller
            </Button>
          </div>
        </div>
      </div>

      {/* Below-the-fold sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Description - 2 cols */}
        <div className={`${glassPanel} p-6 lg:col-span-2`}>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Product Description
          </h2>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {product.description}
          </p>
          {/* Feature highlights */}
          {(product.brand || product.model) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {product.brand && (
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-[11px] text-muted-foreground uppercase">Brand</p>
                  <p className="text-sm font-medium">{product.brand}</p>
                </div>
              )}
              {product.model && (
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-[11px] text-muted-foreground uppercase">Model</p>
                  <p className="text-sm font-medium">{product.model}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Agreement Terms - 1 col */}
        {agreementBullets.length > 0 && (
          <div className={`${glassPanel} p-6 border-l-4 border-l-primary`}>
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Product Agreement
            </h2>
            <ul className="space-y-2">
              {agreementBullets.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Delivery & Fulfillment */}
      <div className={`${glassPanel} p-6`}>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          Delivery & Fulfillment
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-muted/50 p-4 text-center">
            <Truck className="mx-auto h-6 w-6 text-primary mb-2" />
            <p className="text-sm font-medium">{product.delivery_method || "Standard Delivery"}</p>
            <p className="text-xs text-muted-foreground mt-1">Tracked & insured</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-4 text-center">
            <Clock className="mx-auto h-6 w-6 text-primary mb-2" />
            <p className="text-sm font-medium">{product.verification_window_hours || 24}h Verification</p>
            <p className="text-xs text-muted-foreground mt-1">Inspect before release</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-4 text-center">
            <ShieldCheck className="mx-auto h-6 w-6 text-emerald-500 mb-2" />
            <p className="text-sm font-medium">Escrow Protection</p>
            <p className="text-xs text-muted-foreground mt-1">Funds secured until verified</p>
          </div>
        </div>
      </div>

      {/* Customer Reviews - Placeholder */}
      <div className={`${glassPanel} p-6`}>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          Customer Reviews
        </h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="h-5 w-5 text-muted-foreground/20" />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">No reviews yet</p>
          <p className="text-xs text-muted-foreground mt-1">Be the first to review this product after purchase</p>
        </div>
      </div>
    </div>
  );

  if (isAuthenticated) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <BuyerSidebar />
        <main className="flex-1 overflow-y-auto relative">
          {content}
        </main>
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
    </div>
  );
};

export default PublicProductDetail;
