import type { ReactNode } from "react";
import { PackageOpen, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { ProductImage } from "@/components/common/ProductImage";
import { avatarWash } from "@/lib/avatar-wash";
import { sellerVerificationClaim } from "@/lib/trust/trust-claims";

/**
 * The one buyer-facing product card.
 *
 * There were two: the marketplace card and the public storefront card, both
 * showing the same products to the same audience, and they disagreed about
 * what a product is. The marketplace showed the seller's avatar, name and
 * identity-verified claim; the storefront showed a bare name. A buyer who
 * reached the same product through the two surfaces saw different trust
 * information, which is precisely the drift the working agreement's rule 7
 * exists to stop. This card owns the anatomy; the two old components keep
 * their names and delegate, so no page changes.
 *
 * The anatomy, in order: image (with the state that belongs to the product
 * on it), seller row, title, price, one action slot. The master plan asks
 * for six elements including social proof and location; the backend serves
 * neither per product today (no ratings, no sold counts, no product
 * geography), and this codebase does not invent facts, so those two arrive
 * when the data does (PLAN.md item 2.1b).
 *
 * ## Container queries, not viewport units
 *
 * The price used `text-[clamp(0.75rem,3.6vw,1rem)]`: sized by the WINDOW,
 * not by the card. That is why it needed hand-tuning per grid: the same
 * card is ~160px wide in a phone grid and ~300px wide on a desktop, while
 * 3.6vw only knows the viewport. `.pcard` establishes an inline-size
 * container in index.css and `.pcard-price` clamps in `cqw`, so the figure
 * scales with the box that actually holds it. A seven-figure naira price
 * fits a 160px card and does not shout in a 360px one, at every viewport,
 * because the viewport was never the right ruler.
 */

export interface BuyerCardProduct {
  id: string;
  title: string;
  short_description?: string | null;
  unit_price: number;
  currency_code: string;
  primary_image_url?: string | null;
}

export interface BuyerCardSeller {
  full_name: string;
  identity_verified?: boolean;
  /** Present when the seller row should link to the store. */
  onOpenStore?: () => void;
}

interface BuyerProductCardProps {
  product: BuyerCardProduct;
  /** Omit on a storefront page, where every product is this seller's. */
  seller?: BuyerCardSeller;
  showDescription?: boolean;
  outOfStock: boolean;
  lowStock: boolean;
  /** Opens the product. Stretched over the card; always the first control. */
  onOpen?: () => void;
  /** Top-left of the image: featured or category, the caller's call. */
  imageBadge?: ReactNode;
  /** Top-right of the image: the save control on the marketplace. */
  imageAction?: ReactNode;
  /** End of the price row: the cart control on the marketplace. */
  action?: ReactNode;
  /** Below the title: status and visibility chips on seller previews. */
  footer?: ReactNode;
  className?: string;
}

export function BuyerProductCard({
  product,
  seller,
  showDescription = false,
  outOfStock,
  lowStock,
  onOpen,
  imageBadge,
  imageAction,
  action,
  footer,
  className,
}: BuyerProductCardProps) {
  const trustClaim = seller
    ? sellerVerificationClaim({ identityVerified: seller.identity_verified })
    : null;
  const sellerInitial = seller ? (seller.full_name || "S")[0].toUpperCase() : null;

  return (
    <div
      className={cn(
        "pcard group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm transition-all hover:shadow-lg cursor-pointer",
        outOfStock && "opacity-80",
        className,
      )}
    >
      {/* Image, and the state that belongs to the product rather than to the
          seller: stock lives here because in the text column it once squeezed
          the seller's name to a 6px sliver at 360px. */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {product.primary_image_url ? (
          <ProductImage
            url={product.primary_image_url}
            alt={product.title}
            rendition="card"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
            className={cn(
              "transition-transform duration-300 group-hover:scale-105",
              outOfStock && "grayscale",
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

        {imageBadge && <div className="absolute left-2.5 top-2.5">{imageBadge}</div>}
        {imageAction && <div className="absolute right-2.5 top-2.5 z-rail">{imageAction}</div>}

        <div className="absolute bottom-2.5 left-2.5 z-rail">
          {outOfStock ? (
            <Badge variant="destructive" className="px-1.5 py-0 text-xs shadow-sm">Unavailable</Badge>
          ) : lowStock ? (
            <Badge className="border-warning/30 bg-warning/90 px-1.5 py-0 text-xs text-warning-foreground shadow-sm">Low Stock</Badge>
          ) : (
            <Badge className="border-success/30 bg-success/90 px-1.5 py-0 text-xs text-success-foreground shadow-sm">In Stock</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        {seller && (
          <div className="mb-2 flex items-center gap-2">
            {seller.onOpenStore ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  seller.onOpenStore?.();
                }}
                className="relative z-rail flex min-h-11 min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    avatarWash(seller.full_name),
                  )}
                >
                  {sellerInitial}
                </span>
                <span className="truncate text-xs text-muted-foreground transition-colors hover:text-foreground">
                  {seller.full_name}
                </span>
              </button>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    avatarWash(seller.full_name),
                  )}
                >
                  {sellerInitial}
                </span>
                <span className="truncate text-xs text-muted-foreground">{seller.full_name}</span>
              </span>
            )}
            {trustClaim && (
              /* In a narrow card the claim collapses to its glyph; the wording
                 stays in the accessibility tree rather than being dropped. */
              <span className="inline-flex min-w-0 shrink items-center gap-1 text-xs text-primary">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate max-sm:sr-only">{trustClaim}</span>
              </span>
            )}
          </div>
        )}

        <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-tight text-foreground">
          <button
            type="button"
            onClick={onOpen}
            className="text-left after:absolute after:inset-0 after:content-[''] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {product.title}
          </button>
        </h3>

        {showDescription && product.short_description && (
          <p className="mb-2 line-clamp-1 text-xs text-muted-foreground">{product.short_description}</p>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-muted-foreground">{outOfStock ? "Last price" : "Price"}</span>
            {/* Sized by the card via .pcard-price (cqw), never by the viewport.
                whitespace-nowrap keeps a naira figure on one line; the clamp
                floor is the repo's 12px legibility minimum. */}
            <p className="pcard-price whitespace-nowrap font-bold leading-tight tabular-nums text-foreground">
              {formatMoney(product.unit_price, product.currency_code)}
            </p>
          </div>
          {action}
        </div>

        {footer}
      </div>
    </div>
  );
}
