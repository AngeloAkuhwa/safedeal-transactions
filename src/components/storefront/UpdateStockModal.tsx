import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Boxes, Minus, Plus, Package, Info } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { resolveProductStatusLabel, TONE_CLASSNAMES } from "@/lib/status-labels";
import { getAvailableQuantity } from "@/lib/inventory";

interface UpdateStockProduct {
  id: string;
  title: string;
  category_name?: string | null;
  unit_price: number;
  currency_code: string;
  stock_quantity: number;
  reserved_quantity?: number | null;
  status?: string;
  primary_image_url?: string | null;
}

interface UpdateStockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: UpdateStockProduct | null;
  onSave: (productId: string, newQuantity: number) => void;
  isPending?: boolean;
}

function getStockStatus(qty: number) {
  if (qty === 0) return { label: "Out of Stock", color: "text-destructive", bg: "bg-destructive/10", dot: "bg-destructive" };
  if (qty <= 5) return { label: "Low Stock", color: "text-foreground", bg: "bg-warning/10", dot: "bg-warning" };
  return { label: "In Stock", color: "text-foreground", bg: "bg-success/10", dot: "bg-success" };
}

export function UpdateStockModal({ open, onOpenChange, product, onSave, isPending }: UpdateStockModalProps) {
  const [quantity, setQuantity] = useState(0);

  useEffect(() => {
    if (product) setQuantity(product.stock_quantity);
  }, [product]);

  if (!product) return null;

  const reserved = Number(product.reserved_quantity ?? 0);
  const projectedAvailable = Math.max(0, quantity - reserved);
  const stockStatus = getStockStatus(projectedAvailable);
  const currentAvailable = getAvailableQuantity(product);
  const productStatus = resolveProductStatusLabel(product.status || "draft");
  const productStatusClass = TONE_CLASSNAMES[productStatus.tone];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            <DialogTitle>Update Stock</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Product summary */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
            <div className="h-14 w-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
              {product.primary_image_url ? (
                <img src={product.primary_image_url} alt={product.title} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Package className="h-6 w-6 text-muted-foreground/30" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{product.title}</p>
              <p className="text-xs text-muted-foreground">
                {product.category_name && `${product.category_name} · `}
                {formatMoney(product.unit_price, product.currency_code)}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stockStatus.bg} ${stockStatus.color}`}>
                  {getStockStatus(currentAvailable).label}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${productStatusClass}`}>
                  {productStatus.label}
                </span>
              </div>
            </div>
          </div>

          {/* Current stock */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Current Stock</p>
            <p className="text-sm text-muted-foreground">
              {product.stock_quantity} units
              {reserved > 0 && (
                <span className="ml-1 text-xs">
                  ({currentAvailable} available · {reserved} reserved)
                </span>
              )}
            </p>
          </div>

          {/* Quantity adjuster */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl relative before:absolute before:-inset-2 before:content-['']"
              onClick={() => setQuantity(Math.max(0, quantity - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex-1 relative">
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full text-center text-lg font-semibold h-11 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">units</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl relative before:absolute before:-inset-2 before:content-['']"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Quick-set buttons */}
          <div className="flex items-center gap-2">
            {[5, 10, 0].map((val) => (
              <Button
                key={val}
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-xl text-xs"
                onClick={() => setQuantity(val)}
              >
                Set {val}
              </Button>
            ))}
          </div>

          {/* Status preview */}
          <div className={`flex items-center gap-2 p-3 rounded-xl ${stockStatus.bg}`}>
            <span className={`h-2 w-2 rounded-full ${stockStatus.dot}`} />
            <p className={`text-sm font-medium ${stockStatus.color}`}>
              {stockStatus.label}
              {projectedAvailable > 0 && `: ${projectedAvailable} units available`}
              {reserved > 0 && ` (${reserved} reserved)`}
            </p>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>Products with 0 stock remain visible but cannot be purchased until restocked.</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={() => onSave(product.id, quantity)}
            disabled={isPending}
            className="rounded-xl"
          >
            {isPending ? "Saving..." : "Save Stock Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
