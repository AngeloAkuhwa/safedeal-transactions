import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { ProductVisibilityBadge } from "./ProductVisibilityBadge";
import { Package, ShieldCheck, AlertTriangle } from "lucide-react";
import { formatMoney } from "@/lib/format";

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
    status?: string;
    visibility_type?: string;
    primary_image_url?: string | null;
  };
  onClick?: () => void;
  showBadges?: boolean;
  sellerName?: string;
  sellerTrustSummary?: SellerTrustSummary;
}

function getTrustLabel(level: string) {
  if (level === "trusted_buyer") return "Trusted Seller";
  if (level === "basic_verified") return "Verified";
  return null;
}

export function ProductCard({ product, onClick, showBadges = true, sellerName, sellerTrustSummary }: ProductCardProps) {
  const isOutOfStock = product.stock_quantity === 0;
  const isLowStock = product.stock_quantity >= 1 && product.stock_quantity <= 5;
  const trustLabel = sellerTrustSummary ? getTrustLabel(sellerTrustSummary.verification_level) : null;

  return (
    <Card
      className="rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        {product.primary_image_url ? (
          <img
            src={product.primary_image_url}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
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
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-1 group-hover:text-primary transition-colors">
          {product.title}
        </h3>
        {product.short_description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
            {product.short_description}
          </p>
        )}
        <p className="text-base font-bold text-foreground mb-1">
          {formatMoney(product.unit_price, product.currency_code)}
        </p>

        {/* Seller trust signal */}
        {sellerName && (
          <div className="flex items-center gap-1 mb-2">
            <p className="text-xs text-muted-foreground truncate">{sellerName}</p>
            {trustLabel && (
              <ShieldCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
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
        {!showBadges && !sellerName && product.stock_quantity > 0 && (
          <p className="text-xs text-muted-foreground">
            {product.stock_quantity} in stock
          </p>
        )}
      </CardContent>
    </Card>
  );
}
