import { Globe, Users, Lock, type LucideIcon } from "lucide-react";
import { TONE, type Tone } from "@/lib/tone";

/**
 * One vocabulary for product visibility.
 *
 * Five files defined their own version of this map, and they did not agree.
 * The disagreement was not cosmetic:
 *
 *   - `buyer_specific` was labelled "Buyer Specific" on the product detail
 *     page, the preview, the create form and the shared badge, and "Private"
 *     on the storefront card and in the storefront filter dropdown;
 *   - `private_draft` was labelled "Private" by the shared badge, "Draft" by
 *     the filter and "Private Draft" by the create form.
 *
 * So "Private" named two different states depending on where you read it. A
 * seller filtering their storefront by "Private" selected `buyer_specific` and
 * got back a list of products whose badges said "Buyer Specific", while the
 * products actually badged "Private" were the ones the filter left out. The
 * word was doing opposite jobs six inches apart on the same screen.
 *
 * They disagreed on colour too, in every direction: blue and amber in two
 * pages, primary and warning in the badge, primary and muted on the card.
 *
 * This is the single copy. Labels, descriptions, icon and tone all come from
 * here, so the filter and the badge cannot drift apart again.
 */
export type ProductVisibility = "public" | "buyer_specific" | "private_draft";

export interface VisibilityPresentation {
  /** The one label. Used by badges, filters, forms and previews alike. */
  label: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
}

export const PRODUCT_VISIBILITY: Record<ProductVisibility, VisibilityPresentation> = {
  public: {
    label: "Public",
    description: "Visible to everyone on your storefront",
    icon: Globe,
    // Live and reachable is the ordinary good case, so it takes the accent.
    tone: "info",
  },
  buyer_specific: {
    label: "Buyer Specific",
    description: "Only visible to buyers you share the link with",
    icon: Users,
    // Deliberately restricted is not a problem, so it is not a warning. The
    // icon and the label carry the distinction, which they have to anyway:
    // colour is never allowed to be the only thing saying what a state is.
    tone: "muted",
  },
  private_draft: {
    label: "Private Draft",
    description: "Only you can see it",
    icon: Lock,
    tone: "muted",
  },
};

/** Unknown values fall back to the most restrictive reading, never to public. */
export function visibilityOf(value: string | null | undefined): VisibilityPresentation {
  return PRODUCT_VISIBILITY[value as ProductVisibility] ?? PRODUCT_VISIBILITY.private_draft;
}

/** Badge classes for a visibility: wash, hairline, full-contrast words. */
export function visibilityChip(value: string | null | undefined): string {
  return `${TONE[visibilityOf(value).tone].surface} text-foreground`;
}

/** The glyph colour, where tone is allowed to carry weight. */
export function visibilityIconClass(value: string | null | undefined): string {
  return TONE[visibilityOf(value).tone].icon;
}

/** Every visibility, in the order a seller should be offered them. */
export const VISIBILITY_ORDER: ProductVisibility[] = ["public", "buyer_specific", "private_draft"];
