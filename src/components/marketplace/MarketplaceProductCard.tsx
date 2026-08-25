import { useState } from "react";
import { useNavigate } from "react-router";
import { Heart, ShoppingCart, Bell, Star } from "lucide-react";
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
import { BuyerProductCard } from "@/components/product/BuyerProductCard";

interface Props {
  product: MarketplaceProduct;
  categoryName?: string;
  onClick?: () => void;
}

/**
 * The marketplace's wiring around the one buyer card.
 *
 * Anatomy lives in `BuyerProductCard`; this file owns only what is specific
 * to browsing the marketplace signed in or out: the save heart, the cart
 * button behind the commerce gate, the auth modal for anonymous buyers, and
 * the featured/category badge. It used to own the whole card, which is how
 * the storefront's copy drifted to showing different trust information for
 * the same product.
 */
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
      <BuyerProductCard
        product={product}
        seller={{
          full_name: seller.full_name,
          identity_verified: seller.trust_summary?.identity_verified,
          city_name: seller.city_name,
          state_name: seller.state_name,
          onOpenStore: seller.store_slug
            ? () => navigate(`/store/${seller.store_slug}`)
            : undefined,
        }}
        outOfStock={outOfStock}
        lowStock={lowStock}
        onOpen={onClick}
        imageBadge={
          product.is_featured ? (
            <Badge className="border-none bg-primary/90 text-primary-foreground backdrop-blur-sm">
              <Star className="h-3 w-3 fill-current" />
              Featured
            </Badge>
          ) : categoryName ? (
            <Badge className="border-none bg-background/80 text-foreground backdrop-blur-sm">
              {categoryName}
            </Badge>
          ) : null
        }
        imageAction={
          <button
            onClick={handleHeartClick}
            aria-label={isSaved ? "Remove from saved" : "Save for later"}
            className={cn(
              // Visual size stays 32px; the pseudo-element expands the real
              // hit area to 48x48 without shifting layout.
              "relative flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-colors",
              "before:absolute before:-inset-2 before:content-['']",
              isSaved ? "text-destructive" : "text-muted-foreground hover:text-destructive",
            )}
          >
            <Heart className={cn("h-4 w-4", isSaved && "fill-current")} />
          </button>
        }
        action={
          // Dead controls are hidden, not disabled, when the cart is off.
          !gate.loading && !cartBlocked ? (
            <Button
              size="icon"
              variant={outOfStock ? "outline" : "default"}
              aria-label={outOfStock ? "Notify me when back in stock" : "Add to cart"}
              className="relative z-rail h-8 w-8 shrink-0 rounded-lg before:absolute before:-inset-2 before:content-['']"
              disabled={outOfStock || addingToCart}
              onClick={async (e) => {
                e.stopPropagation();
                if (!isAuthenticated) {
                  setShowAuthModal(true);
                  return;
                }
                setAddingToCart(true);
                try {
                  await addToCart(product.id, 1);
                  queryClient.invalidateQueries({ queryKey: ["buyer-cart"] });
                  toast.success("Added to cart!");
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Could not add to cart");
                } finally {
                  setAddingToCart(false);
                }
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
          ) : null
        }
      />

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
