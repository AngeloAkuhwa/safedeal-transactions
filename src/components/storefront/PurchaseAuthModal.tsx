import { useNavigate } from "react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, FileCheck2, Package } from "lucide-react";
import { formatMoney } from "@/lib/format";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-bold text-foreground">
            Complete Your Purchase
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Product preview card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
            <div className="h-16 w-16 rounded-lg bg-muted-foreground/10 flex items-center justify-center overflow-hidden shrink-0">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
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

          {/* CTA text */}
          <div className="text-center space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Create a free SafeDeal account to complete your purchase
            </h3>
            <p className="text-xs text-muted-foreground">Sign in or create an account to continue.</p>
          </div>

          {/* Value propositions */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileCheck2 className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-foreground">
                Review the seller's item and delivery terms
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-foreground">
                Pay through the SafeDeal checkout
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground">
                Keep your order details in one account
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5">
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
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 text-center">
          <button
            onClick={() => onOpenChange(false)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-11 inline-flex items-center"
          >
            Continue browsing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
