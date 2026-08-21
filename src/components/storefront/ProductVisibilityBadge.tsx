import { Badge } from "@/components/ui/badge";
import { visibilityOf, visibilityChip } from "@/lib/product-visibility";

/**
 * The one visibility badge.
 *
 * The label and the tone come from `@/lib/product-visibility`, which is also
 * what the storefront filter, the product card, the detail page, the preview
 * and the create form now read. They used to each carry their own copy, and
 * the copies disagreed: this badge called `private_draft` "Private" while the
 * filter beside it used "Private" to mean `buyer_specific`.
 */
export function ProductVisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <Badge variant="outline" className={visibilityChip(visibility)}>
      {visibilityOf(visibility).label}
    </Badge>
  );
}
