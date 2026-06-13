import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "@/lib/format";
import { Heart, ShoppingCart, Bell, CheckCircle, PackageOpen } from "lucide-react";
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
            <img
              src={product.primary_image_url}
              alt={product.title}
              className={cn(
                "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
                outOfStock && "grayscale"
              )}
              loading="lazy"
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

          {/* Category badge */}
          {categoryName && (
            <Badge className="absolute left-2.5 top-2.5 bg-background/80 text-foreground backdrop-blur-sm border-none text-[11px]">
              {categoryName}
            </Badge>
          )}

          {/* Wishlist */}
          <button
            onClick={handleHeartClick}
            className={cn(
              "absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-colors",
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
              className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
            >
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white",
                  getAvatarColor(seller.full_name)
                )}
              >
                {sellerInitial}
              </div>
              <span className="truncate text-xs text-muted-foreground hover:text-foreground transition-colors">{seller.full_name}</span>
            </button>
            {seller.trust_summary.email_verified && (
              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
            <div className="ml-auto">
              {outOfStock ? (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  Unavailable
                </Badge>
              ) : lowStock ? (
                <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px] px-1.5 py-0">
                  Low Stock
                </Badge>
              ) : (
                <Badge className="bg-success/15 text-success border-success/30 text-[10px] px-1.5 py-0">
                  In Stock
                </Badge>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="mb-2 line-clamp-2 text-sm font-semibold text-foreground leading-tight">
            {product.title}
          </h3>

          {/* Price + cart */}
          <div className="mt-auto flex items-end justify-between">
            <div>
              <span className="text-[10px] text-muted-foreground">
                {outOfStock ? "Last Price" : "Escrow Price"}
              </span>
              <p className="text-base font-bold text-foreground leading-tight">
                {formatPrice(product.unit_price, product.currency_code)}
              </p>
            </div>
            <Button
              size="icon"
              variant={outOfStock ? "outline" : "default"}
              className="h-8 w-8 rounded-lg shrink-0"
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
