import { SellerNavigation } from "@/components/seller/navigation/SellerNavigation";

interface SellerStorefrontSidebarProps {
  sellerName: string;
  avatarUrl: string | null;
  /** Only `identity_verified` may earn a verification claim. */
  identityVerified: boolean;
}

/**
 * The storefront's left rail.
 *
 * Same reasoning as `SellerNav`: the four storefront pages mount this by name
 * and keep working unchanged, while the implementation is now the shared one.
 * That is what closes the gaps this sidebar had drifted into: the missing
 * Analytics and Private Offers links, the notifications it never subscribed to,
 * and the suspension banner it never rendered.
 *
 * New callers should prefer `<SellerNavigation variant="sidebar" />` directly.
 */
export function SellerStorefrontSidebar({
  sellerName,
  avatarUrl,
  identityVerified,
}: SellerStorefrontSidebarProps) {
  return (
    <SellerNavigation
      variant="sidebar"
      sellerName={sellerName}
      avatarUrl={avatarUrl}
      identityVerified={identityVerified}
    />
  );
}
