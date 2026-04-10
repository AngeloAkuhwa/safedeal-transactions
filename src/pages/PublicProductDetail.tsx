import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Shield, ArrowLeft, Package, ShieldCheck, Truck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Footer } from "@/components/landing/Footer";
import { toast } from "@/components/ui/sonner";
import { getPublicProductDetail } from "@/services/public-storefront.service";
import { useState } from "react";

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
  const [selectedImage, setSelectedImage] = useState(0);

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
          <Link to={`/store/${sellerSlug}`}>Back to Store</Link>
        </Button>
      </div>
    );
  }

  const { product, seller } = data;
  const images = (product.media || []).filter((m: any) => m.media_type === "image");
  const currentImage = images[selectedImage]?.file_url;

  const sellerInitials = seller.full_name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleBuyCTA = () => {
    toast.info("Purchase flow coming soon! Contact the seller directly for now.", {
      duration: 4000,
    });
  };

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

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <Link
            to={`/store/${sellerSlug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {seller.full_name}'s Store
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Images */}
            <div>
              <div className="aspect-square rounded-xl border overflow-hidden bg-muted mb-3">
                {currentImage ? (
                  <img
                    src={currentImage}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-20 w-20 text-muted-foreground/20" />
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {images.map((img: any, idx: number) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImage(idx)}
                      className={`w-16 h-16 rounded-lg border-2 overflow-hidden flex-shrink-0 ${
                        idx === selectedImage ? "border-primary" : "border-transparent"
                      }`}
                    >
                      <img src={img.file_url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div>
              {product.category && (
                <Badge variant="outline" className="mb-2">
                  {product.category.name}
                </Badge>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                {product.title}
              </h1>
              {product.short_description && (
                <p className="text-muted-foreground mb-4">{product.short_description}</p>
              )}

              <p className="text-3xl font-bold text-foreground mb-4">
                {formatPrice(product.unit_price, product.currency_code)}
              </p>

              <div className="flex items-center gap-4 mb-6 flex-wrap">
                {product.condition_label && (
                  <Badge variant="outline">
                    {conditionLabels[product.condition_label] || product.condition_label}
                  </Badge>
                )}
                {product.stock_quantity > 0 ? (
                  <span className="text-sm text-success font-medium">
                    {product.stock_quantity} in stock
                  </span>
                ) : (
                  <span className="text-sm text-destructive font-medium">Out of stock</span>
                )}
                {product.brand && (
                  <span className="text-sm text-muted-foreground">Brand: {product.brand}</span>
                )}
              </div>

              {/* Buy CTA - placeholder */}
              <Button
                size="lg"
                className="w-full bg-success hover:bg-success/90 text-white gap-2 mb-6"
                onClick={handleBuyCTA}
                disabled={product.stock_quantity === 0}
              >
                <ShieldCheck className="h-5 w-5" />
                Buy with SafeDeal Protection
              </Button>

              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-6">
                <div className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  Escrow protected
                </div>
                {product.delivery_method && (
                  <div className="flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    {product.delivery_method}
                  </div>
                )}
                {product.verification_window_hours && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {product.verification_window_hours}h to verify
                  </div>
                )}
              </div>

              <Separator className="mb-6" />

              {/* Description */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Description</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {product.description}
                </p>
              </div>

              {product.agreement_terms && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-2">Agreement Terms</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {product.agreement_terms}
                  </p>
                </div>
              )}

              {/* Seller card */}
              <Card className="rounded-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sold by</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={seller.avatar_url ?? undefined} />
                      <AvatarFallback>{sellerInitials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground">{seller.full_name}</p>
                      <div className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-success" />
                        <span className="text-xs text-success">
                          {seller.verification_level === "trusted_buyer"
                            ? "Trusted Seller"
                            : seller.verification_level === "basic_verified"
                            ? "Verified"
                            : "Seller"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    asChild
                  >
                    <Link to={`/store/${sellerSlug}`}>View Store</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PublicProductDetail;
