import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { restockProduct } from "@/services/inventory.service";

interface RestockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productTitle: string;
  currentStock: number;
  currentReserved: number;
}

export function RestockModal({
  open,
  onOpenChange,
  productId,
  productTitle,
  currentStock,
  currentReserved,
}: RestockModalProps) {
  const [delta, setDelta] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const available = Math.max(0, currentStock - currentReserved);

  const mutation = useMutation({
    mutationFn: () => restockProduct(productId, parseInt(delta, 10), notes.trim() || undefined),
    onSuccess: (result) => {
      toast.success(`Restocked. New stock: ${result.stock_quantity}`);
      queryClient.invalidateQueries({ queryKey: ["seller-product-detail", productId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-logs", productId] });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      setDelta("");
      setNotes("");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const parsedDelta = parseInt(delta, 10);
  const isValid = !Number.isNaN(parsedDelta) && parsedDelta > 0 && parsedDelta <= 100000;
  const projectedStock = isValid ? currentStock + parsedDelta : currentStock;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Restock product
          </DialogTitle>
          <DialogDescription className="text-sm">
            Add inventory for <span className="font-medium text-foreground">{productTitle}</span>. This will be logged in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Current stock</p>
              <p className="text-lg font-semibold text-foreground">{currentStock}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reserved</p>
              <p className="text-lg font-semibold text-foreground">{currentReserved}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="text-lg font-semibold text-foreground">{available}</p>
            </div>
          </div>

          <div>
            <Label htmlFor="restock-delta" className="text-sm font-medium">
              Quantity to add
            </Label>
            <Input
              id="restock-delta"
              type="number"
              min="1"
              max="100000"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="e.g. 10"
              className="mt-1.5"
              autoFocus
            />
            {isValid && (
              <p className="text-xs text-muted-foreground mt-1.5">
                New stock will be <span className="font-semibold text-foreground">{projectedStock}</span>
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="restock-notes" className="text-sm font-medium">
              Notes (optional)
            </Label>
            <Textarea
              id="restock-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Received new shipment from supplier"
              rows={2}
              className="mt-1.5"
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="gap-1.5"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
