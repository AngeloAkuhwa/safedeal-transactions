import { ProductStatusBadge } from "./ProductStatusBadge";
import { ProductVisibilityBadge } from "./ProductVisibilityBadge";
import { getAvailableQuantity } from "@/lib/inventory";
import { BuyerProductCard } from "@/components/product/BuyerProductCard";

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

/**
 * The public storefront's wiring around the one buyer card.
 *
 * Anatomy lives in `BuyerProductCard`; this file keeps its name and its prop
 * shape so no page changes, and owns only what is storefront-specific: the
 * description line (a store page has room the marketplace grid does not) and
 * the status/visibility chips a seller sees on their own preview. It used to
 * be a second full card, and a buyer reaching the same product through the
 * marketplace and the store saw different trust information: this delegation
 * is what makes that impossible now.
 */
export function ProductCard({
  product,
  onClick,
  showBadges = true,
  sellerName,
  sellerTrustSummary,
}: ProductCardProps) {
  const available = getAvailableQuantity(product);
  const outOfStock = available === 0;
  const lowStock = available >= 1 && available <= 5;

  return (
    <BuyerProductCard
      product={product}
      seller={
        sellerName
          ? {
              full_name: sellerName,
              identity_verified: sellerTrustSummary?.identity_verified,
            }
          : undefined
      }
      showDescription
      outOfStock={outOfStock}
      lowStock={lowStock}
      onOpen={onClick}
      footer={
        showBadges && product.status ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ProductStatusBadge status={product.status} />
            {product.visibility_type && (
              <ProductVisibilityBadge visibility={product.visibility_type} />
            )}
          </div>
        ) : null
      }
    />
  );
}
