import { useNavigate } from "react-router";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Lock, FileCheck2, Package } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { ProductImage } from "@/components/common/ProductImage";

interface PurchaseAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    name: string;
    image?: string | null;
    price: number;
    currency: string;
  };
  sellerName: string;
  /**
   * Passed in rather than fetched here. `usePublicPricing` is an uncached
   * `useEffect` + edge-function call, and this modal is mounted by
   * PublicProductDetail: which already holds the copy. Calling the hook here
   * too would fire a second `public-pricing` invocation on every view of the
   * busiest public page in the app.
   *
   * Optional because MarketplaceProductCard also mounts this modal, once per
   * card in a grid: requiring it there would mean N fetches for one page of
   * results. Those callers omit it until the hook is cached.
   */
  feeDisclosure?: string;
  returnPath: string;
  quantity?: number;
}

export function PurchaseAuthModal({
  open,
  onOpenChange,
  product,
  sellerName,
  returnPath,
  quantity,
  feeDisclosure,
}: PurchaseAuthModalProps) {
  const navigate = useNavigate();

  const navigateToAuth = (mode: "login" | "signup") => {
    sessionStorage.setItem("safedeal_redirect", returnPath);
    if (quantity && quantity > 1) {
      sessionStorage.setItem("safedeal_quantity", String(quantity));
    }
    navigate(`/auth?mode=${mode}`);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      // md:, not sm:. The sheet presentation runs below 768 and is edge to
      // edge by design, so an unqualified max-width would pin it to 448px
      // against the left edge of the phone.
      className="md:max-w-md"
      title="Complete Your Purchase"
      description="Sign in or create an account to continue."
      footer={
        <div className="w-full space-y-2.5">
          <Button
            className="w-full rounded-xl h-11 font-semibold"
            onClick={() => navigateToAuth("signup")}
          >
            Create Account
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl h-11 font-semibold"
            onClick={() => navigateToAuth("login")}
          >
            Log In
          </Button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors min-h-11 inline-flex items-center justify-center"
          >
            Continue browsing
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Product preview card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
          <div className="h-16 w-16 rounded-lg bg-muted-foreground/10 flex items-center justify-center overflow-hidden shrink-0">
            {product.image ? (
              /* Was a bare <img>: no srcset, no Cloudinary transform, the
                 full master download for a 64px box. */
              <ProductImage url={product.image} alt={product.name} rendition="card" sizes="64px" />
            ) : (
              <Package className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {product.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Sold by {sellerName}
            </p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {formatMoney(product.price, product.currency)}
            </p>
          </div>
      </div>

      {/* The fee belongs wherever the buyer decides to commit, and this
          modal is one of those moments: it is the gate between "I want
          this" and signing up to buy it. The product page already
          discloses it; this was the one commit surface still showing a
          bare price. */}
      {feeDisclosure && (
        <p className="text-xs leading-relaxed text-muted-foreground">{feeDisclosure}</p>
      )}

      {/* The reason to sign up, once. It used to be a centred heading here
          plus a near identical line under the title; the description slot
          now carries the second half. */}
      <p className="text-sm font-semibold text-foreground">
        Create a free SafeDeal account to complete your purchase
      </p>

      {/* Value propositions */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <FileCheck2 className="shrink-0 h-4 w-4 text-primary" />
          <span className="text-sm text-foreground">
            Review the seller's item and delivery terms
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Lock className="shrink-0 h-4 w-4 text-primary" />
          <span className="text-sm text-foreground">
            Pay through the SafeDeal checkout
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Package className="shrink-0 h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            Keep your order details in one account
          </span>
        </div>
      </div>
      </div>
    </ResponsiveDialog>
  );
}
