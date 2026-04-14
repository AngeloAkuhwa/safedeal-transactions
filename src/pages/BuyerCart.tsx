import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Trash2, Minus, Plus, Package, Loader2, ArrowLeft,
  ShieldCheck, AlertTriangle, CheckCircle2, ShoppingBag, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import {
  getCartItems, removeFromCart, updateCartQuantity, checkoutSelected,
  CartItem,
} from "@/services/cart.service";
import { computePricing } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";

function formatPrice(amount: number, currency = "NGN") {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString()}`;
  return `${currency} ${Number(amount).toLocaleString()}`;
}

function getStockStatus(item: CartItem) {
  if (!item.product) return { label: "Unavailable", variant: "destructive" as const, canCheckout: false };
  const avail = item.product.available_quantity;
  if (avail <= 0) return { label: "Sold Out", variant: "destructive" as const, canCheckout: false };
  if (item.quantity > avail) return { label: `Only ${avail} left — reduce qty`, variant: "warning" as const, canCheckout: false };
  if (avail <= 3) return { label: `Low Stock (${avail} left)`, variant: "warning" as const, canCheckout: true };
  return { label: "In Stock", variant: "success" as const, canCheckout: true };
}

const statusClasses = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
};

const BuyerCart = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["buyer-cart"],
    queryFn: getCartItems,
  });

  const items: CartItem[] = data?.items || [];

  // Realtime subscription for product stock changes
  useEffect(() => {
    if (items.length === 0) return;
    const productIds = items.map((i) => i.product_id);

    const channel = supabase
      .channel("cart-products-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products" },
        (payload) => {
          if (productIds.includes(payload.new?.id)) {
            queryClient.invalidateQueries({ queryKey: ["buyer-cart"] });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [items.length, queryClient]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectableItems = items.filter((i) => getStockStatus(i).canCheckout);
  const allSelected = selectableItems.length > 0 && selectableItems.every((i) => selected.has(i.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableItems.map((i) => i.id)));
    }
  };

  const handleRemove = async (productId: string, cartItemId: string) => {
    setRemoving(cartItemId);
    try {
      await removeFromCart(productId);
      setSelected((prev) => { const n = new Set(prev); n.delete(cartItemId); return n; });
      await refetch();
      toast.success("Removed from cart");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRemoving(null);
    }
  };

  const handleQuantityChange = async (productId: string, newQty: number) => {
    try {
      await updateCartQuantity(productId, newQty);
      await refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCheckout = async () => {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0) {
      toast.error("Select at least one item");
      return;
    }

    // Validate all selected can checkout
    const invalid = items.filter((i) => selected.has(i.id) && !getStockStatus(i).canCheckout);
    if (invalid.length > 0) {
      toast.error("Some selected items need attention before checkout");
      return;
    }

    setCheckingOut(true);
    try {
      const result = await checkoutSelected(selectedIds);
      toast.success("Checkout session created! Redirecting...");
      navigate(`/dashboard/cart/checkout?session=${result.checkout_session_id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCheckingOut(false);
    }
  };

  // Compute selected totals
  const selectedItems = items.filter((i) => selected.has(i.id) && i.product);
  const selectedSubtotal = selectedItems.reduce((sum, i) => sum + (i.product!.unit_price * i.quantity), 0);

  // Group selected by seller for fee computation
  const sellerGroups = new Map<string, number>();
  for (const item of selectedItems) {
    const sid = item.product!.seller_id;
    sellerGroups.set(sid, (sellerGroups.get(sid) || 0) + item.product!.unit_price * item.quantity);
  }
  let selectedFees = 0;
  for (const [, amount] of sellerGroups) {
    selectedFees += computePricing(amount).service_fee_amount;
  }
  const selectedTotal = selectedSubtotal + selectedFees;

  // Group items by seller for display
  const groupedBySeller = new Map<string, CartItem[]>();
  for (const item of items) {
    const key = item.product?.seller_id || "unknown";
    if (!groupedBySeller.has(key)) groupedBySeller.set(key, []);
    groupedBySeller.get(key)!.push(item);
  }

  const glassPanel = "bg-card/60 backdrop-blur-sm border border-border rounded-2xl";

  return (
    <div className="flex min-h-screen bg-background">
      <BuyerSidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
                <ShoppingCart className="h-7 w-7 text-primary" />
                My Cart
                {items.length > 0 && (
                  <Badge variant="outline" className="text-sm">{items.length} item{items.length !== 1 ? "s" : ""}</Badge>
                )}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Review your saved items and proceed to checkout</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/marketplace")} className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              Continue Shopping
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className={`${glassPanel} p-12 text-center space-y-4`}>
              <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mx-auto" />
              <h2 className="text-xl font-semibold text-foreground">Your cart is empty</h2>
              <p className="text-muted-foreground">Browse the marketplace to find products</p>
              <Button onClick={() => navigate("/dashboard/marketplace")} className="gap-2">
                <ShoppingBag className="h-4 w-4" />
                Browse Marketplace
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cart items — 2/3 */}
              <div className="lg:col-span-2 space-y-4">
                {/* Select all bar */}
                <div className={`${glassPanel} p-3 flex items-center justify-between`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-sm font-medium text-foreground">
                      Select All ({selectableItems.length} eligible)
                    </span>
                  </label>
                  {selected.size > 0 && (
                    <span className="text-sm text-primary font-medium">{selected.size} selected</span>
                  )}
                </div>

                {/* Items grouped by seller */}
                {Array.from(groupedBySeller.entries()).map(([sellerId, sellerItems]) => {
                  const sellerName = sellerItems[0]?.product?.seller_name || "Seller";
                  return (
                    <div key={sellerId} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">{sellerName}</span>
                      </div>
                      {sellerItems.map((item) => {
                        const stock = getStockStatus(item);
                        const isRemoving = removing === item.id;
                        return (
                          <div key={item.id} className={`${glassPanel} p-4 flex gap-4 ${stock.variant === "destructive" ? "opacity-60" : ""}`}>
                            <div className="flex items-start pt-1">
                              <Checkbox
                                checked={selected.has(item.id)}
                                onCheckedChange={() => toggleSelect(item.id)}
                                disabled={!stock.canCheckout}
                              />
                            </div>
                            <div className="h-20 w-20 rounded-xl overflow-hidden bg-muted shrink-0">
                              {item.product?.primary_image ? (
                                <img src={item.product.primary_image} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  <Package className="h-8 w-8 text-muted-foreground/20" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-semibold text-foreground leading-tight line-clamp-1">
                                    {item.product?.title || "Unknown Product"}
                                  </h3>
                                  {item.product?.short_description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">{item.product.short_description}</p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                  onClick={() => handleRemove(item.product_id, item.id)}
                                  disabled={isRemoving}
                                >
                                  {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              </div>

                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`rounded-full text-xs ${statusClasses[stock.variant]} gap-1`}>
                                    {stock.variant === "success" && <CheckCircle2 className="h-3 w-3" />}
                                    {stock.variant === "warning" && <AlertTriangle className="h-3 w-3" />}
                                    {stock.label}
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-3">
                                  {/* Quantity selector */}
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
                                      onClick={() => handleQuantityChange(item.product_id, item.quantity - 1)}
                                      disabled={item.quantity <= 1}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                                    <button
                                      className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
                                      onClick={() => handleQuantityChange(item.product_id, item.quantity + 1)}
                                      disabled={item.product ? item.quantity >= item.product.available_quantity : true}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <span className="font-semibold text-foreground whitespace-nowrap">
                                    {item.product ? formatPrice(item.product.unit_price * item.quantity, item.product.currency_code) : "—"}
                                  </span>
                                </div>
                              </div>

                              {stock.variant === "warning" && !stock.canCheckout && item.product && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7 gap-1"
                                  onClick={() => handleQuantityChange(item.product_id, item.product!.available_quantity)}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Adjust to {item.product.available_quantity}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Summary sidebar — 1/3 */}
              <div className="lg:col-span-1">
                <div className="lg:sticky lg:top-4 space-y-4">
                  <div className={`${glassPanel} p-5 space-y-4`}>
                    <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
                    {selected.size === 0 ? (
                      <p className="text-sm text-muted-foreground">Select items to see summary</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal ({selected.size} item{selected.size !== 1 ? "s" : ""})</span>
                          <span className="font-medium">{formatPrice(selectedSubtotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <div>
                            <span className="text-muted-foreground">Protection Fee</span>
                            <p className="text-[10px] text-muted-foreground">Non-refundable</p>
                          </div>
                          <span className="font-medium">{formatPrice(selectedFees)}</span>
                        </div>
                        <div className="border-t border-border pt-3 flex justify-between">
                          <span className="font-bold text-foreground">Total</span>
                          <span className="text-xl font-bold text-foreground">{formatPrice(selectedTotal)}</span>
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full gap-2 rounded-xl h-12 text-base font-semibold bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground shadow-lg shadow-primary/20"
                      disabled={selected.size === 0 || checkingOut}
                      onClick={handleCheckout}
                    >
                      {checkingOut ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-5 w-5" />
                      )}
                      {checkingOut ? "Processing..." : `Checkout (${selected.size})`}
                    </Button>
                  </div>

                  {/* Trust card */}
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                      <span className="font-semibold text-foreground text-sm">SafeDeal Protection</span>
                    </div>
                    <ul className="space-y-1.5">
                      {["Funds held in escrow until confirmed", "Independent dispute resolution per seller", "Full refund if items don't match"].map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default BuyerCart;
