import { useState } from "react";
import { Heart, ShoppingCart, Bell, CheckCircle, PackageOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketplaceProduct } from "@/services/marketplace.service";

interface Props {
  product: MarketplaceProduct;
  categoryName?: string;
  onClick?: () => void;
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

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
  const [imgError, setImgError] = useState(false);
  const [liked, setLiked] = useState(false);
  const outOfStock = product.stock_quantity <= 0;
  const lowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;
  const seller = product.seller;
  const sellerInitial = (seller.full_name || "S")[0].toUpperCase();

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm transition-all hover:shadow-lg cursor-pointer",
        outOfStock && "opacity-80"
      )}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {!imgError && product.primary_image_url ? (
          <img
            src={product.primary_image_url}
            alt={product.title}
            className={cn(
              "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
              outOfStock && "grayscale"
            )}
            onError={() => setImgError(true)}
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
          onClick={(e) => {
            e.stopPropagation();
            setLiked(!liked);
          }}
          className={cn(
            "absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-colors",
            liked ? "text-destructive" : "text-muted-foreground hover:text-destructive"
          )}
        >
          <Heart className={cn("h-4 w-4", liked && "fill-current")} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3.5">
        {/* Seller row */}
        <div className="mb-2 flex items-center gap-2">
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white",
              getAvatarColor(seller.full_name)
            )}
          >
            {sellerInitial}
          </div>
          <span className="truncate text-xs text-muted-foreground">{seller.full_name}</span>
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
            disabled={outOfStock}
            onClick={(e) => e.stopPropagation()}
          >
            {outOfStock ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
