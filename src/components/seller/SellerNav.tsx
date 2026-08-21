import { SellerNavigation } from "./navigation/SellerNavigation";

interface SellerNavProps {
  sellerName: string;
  avatarUrl: string | null;
}

/**
 * The seller header.
 *
 * Kept as a named export so the sixteen pages that mount it do not have to
 * change in the same commit that unifies the implementation. A wide mechanical
 * rename and a behaviour change in one diff is a diff nobody can review. The
 * component itself now lives in `./navigation/SellerNavigation`, shared with
 * the storefront sidebar.
 *
 * New callers should prefer `<SellerNavigation variant="header" />` directly.
 */
export function SellerNav({ sellerName, avatarUrl }: SellerNavProps) {
  return <SellerNavigation variant="header" sellerName={sellerName} avatarUrl={avatarUrl} />;
}
