import { Archive, EyeOff, Info, Package, X } from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { ProductVisibilityBadge } from "./ProductVisibilityBadge";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { formatMoney } from "@/lib/format";

interface ManageVisibilityProduct {
  id: string;
  title: string;
  category_name?: string | null;
  unit_price: number;
  currency_code: string;
  status?: string;
  visibility_type?: string;
  primary_image_url?: string | null;
}

interface ManageVisibilityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ManageVisibilityProduct | null;
  onUnpublish: (productId: string) => void;
  onArchive: (productId: string) => void;
  isPending?: boolean;
}

export function ManageVisibilityModal({
  open,
  onOpenChange,
  product,
  onUnpublish,
  onArchive,
  isPending,
}: ManageVisibilityModalProps) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-modal w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-card rounded-2xl border border-border shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] mx-4"
        >
          <VisuallyHidden.Root><DialogTitle>Manage Product Visibility</DialogTitle></VisuallyHidden.Root>
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Manage Product Visibility
              </h3>
              <DialogPrimitive.Close className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Product summary */}
            <div className="flex items-start gap-4 p-4 bg-muted border border-border rounded-xl">
              <div className="w-20 h-20 rounded-lg bg-card border border-border flex-shrink-0 overflow-hidden">
                {product.primary_image_url ? (
                  <img
                    src={product.primary_image_url}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-foreground mb-1">{product.title}</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  {product.category_name ? `${product.category_name} • ` : ""}
                  {formatMoney(product.unit_price, product.currency_code)}
                </p>
                <div className="flex items-center gap-2">
                  {product.status && <ProductStatusBadge status={product.status} />}
                  {product.visibility_type && (
                    <ProductVisibilityBadge visibility={product.visibility_type} />
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-4">
              {/* Warning banner */}
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1">Choose an action</p>
                    <p className="text-xs text-muted-foreground">
                      Select how you want to manage this product's visibility on your storefront.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {/* Unpublish */}
                <div className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 flex-shrink-0">
                      <EyeOff className="h-5 w-5 text-warning" />
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-foreground mb-1">Unpublish Product</h5>
                      <p className="text-xs text-muted-foreground mb-3">
                        Removes this product from your public storefront. Buyers will no longer see or purchase this item. You can republish it anytime.
                      </p>
                      <button
                        disabled={isPending}
                        onClick={() => onUnpublish(product.id)}
                        className="rounded-lg bg-warning px-4 py-2 text-sm font-medium text-warning-foreground transition-all hover:bg-warning/90 disabled:opacity-50 min-h-11"
                      >
                        Unpublish Product
                      </button>
                    </div>
                  </div>
                </div>

                {/* Archive */}
                <div className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <Archive className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-foreground mb-1">Archive Product</h5>
                      <p className="text-xs text-muted-foreground mb-3">
                        Removes this product from active listing management and your public store. Archived products are hidden but can be restored later if needed.
                      </p>
                      <button
                        disabled={isPending}
                        onClick={() => onArchive(product.id)}
                        className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-red-600 transition-all disabled:opacity-50 min-h-11"
                      >
                        Archive Product
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                onClick={() => onOpenChange(false)}
                className="px-6 py-2.5 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-all min-h-11"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
