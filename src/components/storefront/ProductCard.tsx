import { Card, CardContent } from "@/components/ui/card";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { ProductVisibilityBadge } from "./ProductVisibilityBadge";
import { Package } from "lucide-react";

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    slug: string;
    short_description?: string | null;
    unit_price: number;
    currency_code: string;
    stock_quantity: number;
    status: string;
    visibility_type?: string;
    primary_image_url?: string | null;
  };
  onClick?: () => void;
  showBadges?: boolean;
}

function formatPrice(amount: number, currency: string) {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString()}`;
  return `${currency} ${Number(amount).toLocaleString()}`;
}

export function ProductCard({ product, onClick, showBadges = true }: ProductCardProps) {
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
        {product.stock_quantity === 0 && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-sm font-semibold text-destructive bg-background/80 px-3 py-1 rounded-full">
              Out of Stock
            </span>
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
        <p className="text-base font-bold text-foreground mb-2">
          {formatPrice(product.unit_price, product.currency_code)}
        </p>
        {showBadges && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <ProductStatusBadge status={product.status} />
            {product.visibility_type && (
              <ProductVisibilityBadge visibility={product.visibility_type} />
            )}
          </div>
        )}
        {!showBadges && product.stock_quantity > 0 && (
          <p className="text-xs text-muted-foreground">
            {product.stock_quantity} in stock
          </p>
        )}
      </CardContent>
    </Card>
  );
}
