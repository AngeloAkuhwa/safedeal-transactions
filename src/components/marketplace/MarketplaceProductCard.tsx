import { useState } from "react";
import { useNavigate } from "react-router";
import { formatMoney } from "@/lib/format";
import { Heart, ShoppingCart, Bell, ShieldCheck, PackageOpen, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToggleSave, useAuthState, useSavedProductIds } from "@/hooks/useSavedProducts";
import { PurchaseAuthModal } from "@/components/storefront/PurchaseAuthModal";
import { toast } from "@/components/ui/sonner";
import { addToCart } from "@/services/cart.service";
import { useQueryClient } from "@tanstack/react-query";
import type { MarketplaceProduct } from "@/services/marketplace.service";
import { getAvailableQuantity } from "@/lib/inventory";
import { useCommerceGate } from "@/hooks/useCommerceGate";
import { ProductImage } from "@/components/common/ProductImage";
import { sellerVerificationClaim } from "@/lib/trust/trust-claims";

interface Props {
  product: MarketplaceProduct;
  categoryName?: string;
  onClick?: () => void;
}

const formatPrice = (amount: number, currency: string) =>
  formatMoney(amount, currency);

const avatarColors = [
  "from-primary to-blue-400",
  "from-emerald-500 to-teal-400",
  "from-violet-500 to-purple-400",
  "from-orange-500 to-amber-400",
  "from-rose-500 to-pink-400",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function MarketplaceProductCard({ product, categoryName, onClick }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthState();
  const { data: savedIds } = useSavedProductIds();
  const toggleSave = useToggleSave();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  const isSaved = (savedIds || []).includes(product.id);
  const available = getAvailableQuantity(product);
  const outOfStock = available <= 0;
  const lowStock = available > 0 && available <= 5;
  const seller = product.seller;
  const sellerInitial = (seller.full_name || "S")[0].toUpperCase();
  // Same signal, same resolver as ProductCard: the mark always states its basis.
  const sellerTrustClaim = sellerVerificationClaim({
    identityVerified: seller.trust_summary?.identity_verified,
  });
  // Vendor-scoped gate so per-vendor overrides disable the CTA proactively.
  const gate = useCommerceGate(seller.id);
  const cartBlocked = !gate.loading && !gate.addToCartEnabled;

  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    toggleSave.mutate({ productId: product.id, saved: isSaved });
    toast.success(isSaved ? "Removed from saved" : "Saved for later");
  };

  return (
    <>
      {/* The card is a plain container. The title below is the real control and
          is stretched over the whole card, so nested buttons stay valid. */}
      <div
        onClick={onClick}
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm transition-all hover:shadow-lg cursor-pointer",
          outOfStock && "opacity-80"
        )}
      >
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          {product.primary_image_url ? (
            <ProductImage
              url={product.primary_image_url}
              alt={product.title}
              rendition="card"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
              className={cn(
                "transition-transform duration-300 group-hover:scale-105",
                outOfStock && "grayscale"
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PackageOpen className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}

          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <span className="rounded-full bg-destructive/90 px-3 py-1 text-xs font-semibold text-destructive-foreground">
                Out of Stock
              </span>
            </div>
          )}

          {/* Featured placement (paid) */}
          {product.is_featured && (
            <Badge className="absolute left-2.5 top-2.5 border-none bg-primary/90 text-primary-foreground backdrop-blur-sm">
              <Star className="h-3 w-3 fill-current" />
              Featured
            </Badge>
          )}

          {/* Category badge */}
          {categoryName && !product.is_featured && (
            <Badge className="absolute left-2.5 top-2.5 bg-background/80 text-foreground backdrop-blur-sm border-none">
              {categoryName}
            </Badge>
          )}

          {/* Wishlist */}
          <button
            onClick={handleHeartClick}
            aria-label={isSaved ? "Remove from saved" : "Save for later"}
            className={cn(
              // Visual size stays 32px; the pseudo-element expands the real hit
              // area to 48x48 (>=44px) without shifting layout.
              "absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-colors",
              "before:absolute before:-inset-2 before:content-['']",
              isSaved ? "text-destructive" : "text-muted-foreground hover:text-destructive"
            )}
          >
            <Heart className={cn("h-4 w-4", isSaved && "fill-current")} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-3.5">
          {/* Seller row */}
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (seller.store_slug) navigate(`/store/${seller.store_slug}`);
              }}
              className="relative z-10 flex min-h-11 min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
            >
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white",
                  getAvatarColor(seller.full_name)
                )}
              >
                {sellerInitial}
              </div>
              <span className="truncate text-xs text-muted-foreground hover:text-foreground transition-colors">{seller.full_name}</span>
            </button>
            {sellerTrustClaim && (
              /* At 360px the claim collapses to its icon; the wording stays in
                 the accessibility tree rather than being dropped. */
              <span className="inline-flex min-w-0 shrink items-center gap-1 text-xs text-primary">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate max-sm:sr-only">{sellerTrustClaim}</span>
              </span>
            )}
            <div className="ml-auto shrink-0">
              {outOfStock ? (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  Unavailable
                </Badge>
              ) : lowStock ? (
                <Badge className="bg-warning/15 text-warning border-warning/30 px-1.5 py-0">
                  Low Stock
                </Badge>
              ) : (
                <Badge className="bg-success/15 text-success border-success/30 px-1.5 py-0">
                  In Stock
                </Badge>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="mb-2 line-clamp-2 text-sm font-semibold text-foreground leading-tight">
            <button
              type="button"
              onClick={onClick}
              className="text-left after:absolute after:inset-0 after:content-[''] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {product.title}
            </button>
          </h3>

          {/* Price + cart */}
          <div className="mt-auto flex items-end justify-between">
            <div>
              <span className="text-xs text-muted-foreground">
                {outOfStock ? "Last price" : "Price"}
              </span>
              <p className="text-base font-bold text-foreground leading-tight">
                {formatPrice(product.unit_price, product.currency_code)}
              </p>
            </div>
            {/* Dead controls are hidden, not disabled, when the cart is off. */}
            {!gate.loading && !cartBlocked && (
            <Button
              size="icon"
              variant={outOfStock ? "outline" : "default"}
              aria-label={outOfStock ? "Notify me when back in stock" : "Add to cart"}
              className="relative z-10 h-8 w-8 shrink-0 rounded-lg before:absolute before:-inset-2 before:content-['']"
              disabled={outOfStock || addingToCart}
              onClick={async (e) => {
                e.stopPropagation();
                if (!isAuthenticated) { setShowAuthModal(true); return; }
                setAddingToCart(true);
                try {
                  await addToCart(product.id, 1);
                  queryClient.invalidateQueries({ queryKey: ["buyer-cart"] });
                  toast.success("Added to cart!");
                } catch (err: any) { toast.error(err.message); }
                finally { setAddingToCart(false); }
              }}
            >
              {outOfStock ? (
                <Bell className="h-3.5 w-3.5" />
              ) : addingToCart ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5" />
              )}
            </Button>
            )}
          </div>
        </div>
      </div>

      {/* Auth modal for unauthenticated users */}
      <PurchaseAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        product={{
          name: product.title,
          image: product.primary_image_url,
          price: product.unit_price,
          currency: product.currency_code,
        }}
        sellerName={seller.full_name}
        returnPath={window.location.pathname}
      />
    </>
  );
}
