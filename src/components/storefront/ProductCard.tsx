import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { ProductVisibilityBadge } from "./ProductVisibilityBadge";
import { Package, ShieldCheck, AlertTriangle } from "lucide-react";
import { sellerVerificationClaim } from "@/lib/trust/trust-claims";
import { formatMoney } from "@/lib/format";
import { getAvailableQuantity } from "@/lib/inventory";
import { ProductImage } from "@/components/common/ProductImage";

interface SellerTrustSummary {
  verification_level: string;
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
}

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    slug: string;
    short_description?: string | null;
    unit_price: number;
    currency_code: string;
    stock_quantity: number;
    reserved_quantity?: number | null;
    status?: string;
    visibility_type?: string;
    primary_image_url?: string | null;
  };
  onClick?: () => void;
  showBadges?: boolean;
  sellerName?: string;
  sellerTrustSummary?: SellerTrustSummary;
}

export function ProductCard({ product, onClick, showBadges = true, sellerName, sellerTrustSummary }: ProductCardProps) {
  const available = getAvailableQuantity(product);
  const isOutOfStock = available === 0;
  const isLowStock = available >= 1 && available <= 5;
  // Only a real identity verification earns a mark, and the mark always states its basis.
  const trustClaim = sellerVerificationClaim({ identityVerified: sellerTrustSummary?.identity_verified });

  return (
    /* Plain container + stretched title button: keyboard users get a real
       control and any future in-card action stays valid ARIA. */
    <Card
      className="relative h-full flex flex-col rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        {product.primary_image_url ? (
          <ProductImage
            url={product.primary_image_url}
            alt={product.title}
            rendition="card"
            sizes="(max-width: 640px) 50vw, 300px"
            className="group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-sm font-semibold text-destructive bg-background/80 px-3 py-1 rounded-full">
              Out of Stock
            </span>
          </div>
        )}
        {isLowStock && !isOutOfStock && (
          <div className="absolute top-2 right-2">
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Low Stock
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="flex-1 p-4">
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-1 group-hover:text-primary transition-colors">
          <button
            type="button"
            onClick={onClick}
            className="text-left after:absolute after:inset-0 after:content-[''] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {product.title}
          </button>
        </h3>
        {product.short_description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
            {product.short_description}
          </p>
        )}
        {/* Same fluid figure as the marketplace card: a seven- or eight-figure
            naira price is wider than a narrow card's content box at 16px, and the
            app hides horizontal scrollbars so the overflow is invisible. 12px
            floor, 16px ceiling, never wraps mid-number. */}
        <p className="mb-1 whitespace-nowrap text-[clamp(0.75rem,3.6vw,1rem)] font-bold tabular-nums text-foreground">
          {formatMoney(product.unit_price, product.currency_code)}
        </p>

        {/* Seller trust signal */}
        {sellerName && (
          <div className="flex items-center gap-1 mb-2">
            <p className="text-xs text-muted-foreground truncate">{sellerName}</p>
            {trustClaim && (
              <span className="inline-flex items-center gap-1 text-xs text-primary flex-shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
                {trustClaim}
              </span>
            )}
          </div>
        )}

        {showBadges && product.status && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <ProductStatusBadge status={product.status} />
            {product.visibility_type && (
              <ProductVisibilityBadge visibility={product.visibility_type} />
            )}
          </div>
        )}
        {!showBadges && !sellerName && available > 0 && (
          <p className="text-xs text-muted-foreground">
            {available} in stock
          </p>
        )}
      </CardContent>
    </Card>
  );
}
