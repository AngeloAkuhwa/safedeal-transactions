import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Trash2, Minus, Plus, Package, Loader2,
  ShieldCheck, AlertTriangle, CheckCircle2, ShoppingBag, RefreshCw,
  UserCheck, Clock, Info, ExternalLink,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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

const BuyerCart = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [removingSelected, setRemovingSelected] = useState(false);
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
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableItems.map((i) => i.id)));
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

  const handleRemoveSelected = async () => {
    const selectedArr = items.filter((i) => selected.has(i.id));
    if (selectedArr.length === 0) return;
    setRemovingSelected(true);
    try {
      for (const item of selectedArr) {
        await removeFromCart(item.product_id);
      }
      setSelected(new Set());
      await refetch();
      toast.success(`Removed ${selectedArr.length} item${selectedArr.length !== 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRemovingSelected(false);
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
    if (selectedIds.length === 0) { toast.error("Select at least one item"); return; }
    const invalid = items.filter((i) => selected.has(i.id) && !getStockStatus(i).canCheckout);
    if (invalid.length > 0) { toast.error("Some selected items need attention before checkout"); return; }
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

  const needsAttentionCount = items.filter((i) => !getStockStatus(i).canCheckout).length;

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
            <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-4">
              <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mx-auto" />
              <h2 className="text-xl font-semibold text-foreground">Your cart is empty</h2>
              <p className="text-muted-foreground">Browse the marketplace to find products</p>
              <Button onClick={() => navigate("/dashboard/marketplace")} className="gap-2">
                <ShoppingBag className="h-4 w-4" /> Browse Marketplace
              </Button>
            </div>
          ) : (
            <>
              {/* Summary stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Items</p>
                    <p className="text-2xl font-bold text-foreground">{items.length}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Selected for Checkout</p>
                    <p className="text-2xl font-bold text-emerald-600">{selected.size}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Needs Attention</p>
                    <p className="text-2xl font-bold text-destructive">{needsAttentionCount}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Cart items — 2/3 */}
                <div className="lg:col-span-2 space-y-3">
                  {/* Select all bar */}
                  <div className="rounded-xl border border-border bg-card p-3 flex items-center justify-between">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                      <span className="text-sm font-medium text-foreground">
                        Select All ({selectableItems.length} eligible)
                      </span>
                    </label>
                    <div className="flex items-center gap-3">
                      {selected.size > 0 && (
                        <>
                          <span className="text-sm text-primary font-medium">{selected.size} selected</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            onClick={handleRemoveSelected}
                            disabled={removingSelected}
                          >
                            {removingSelected ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Remove Selected
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Flat item list */}
                  {items.map((item) => {
                    const stock = getStockStatus(item);
                    const isRemoving = removing === item.id;
                    const isSelected = selected.has(item.id);
                    const isSoldOut = stock.variant === "destructive";

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border bg-card transition-colors ${
                          isSelected ? "border-primary border-2" : "border-border"
                        } ${isSoldOut ? "opacity-60" : ""}`}
                      >
                        {/* Top section */}
                        <div className="p-4 flex gap-4">
                          <div className="flex items-start pt-1 shrink-0">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(item.id)}
                              disabled={!stock.canCheckout}
                            />
                          </div>
                          {(() => {
                            const canNavigate = !isSoldOut && !!item.product?.seller_slug && !!item.product?.slug;
                            const clickableContent = (
                              <div
                                className={`flex gap-4 flex-1 min-w-0 ${canNavigate ? "cursor-pointer group/item" : ""}`}
                                onClick={canNavigate ? () => navigate(`/store/${item.product!.seller_slug}/${item.product!.slug}/checkout?qty=${item.quantity}`) : undefined}
                              >
                                <div className={`h-28 w-28 sm:h-32 sm:w-32 rounded-xl overflow-hidden bg-muted shrink-0 ${canNavigate ? "group-hover/item:ring-2 group-hover/item:ring-primary/40 transition-all" : ""}`}>
                                  {item.product?.primary_image ? (
                                    <img src={item.product.primary_image} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                      <Package className="h-10 w-10 text-muted-foreground/20" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <h3 className={`font-semibold text-foreground leading-tight line-clamp-2 text-base ${canNavigate ? "group-hover/item:text-primary transition-colors" : ""}`}>
                                      {item.product?.title || "Unknown Product"}
                                    </h3>
                                    {canNavigate && (
                                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0" />
                                    )}
                                  </div>
                                  {item.product?.short_description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">{item.product.short_description}</p>
                                  )}
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span>Sold by</span>
                                    {item.product?.seller_slug ? (
                                      <Link
                                        to={`/store/${item.product.seller_slug}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-medium text-foreground hover:text-primary transition-colors"
                                      >
                                        {item.product?.seller_name || "Seller"}
                                      </Link>
                                    ) : (
                                      <span className="font-medium text-foreground">{item.product?.seller_name || "Seller"}</span>
                                    )}
                                    <CheckCircle2 className="h-3 w-3 text-primary" />
                                  </div>
                                  {/* Stock badge */}
                                  <Badge
                                    variant="outline"
                                    className={`rounded-full text-xs gap-1 ${
                                      stock.variant === "success"
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                        : stock.variant === "warning"
                                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                        : "bg-destructive/10 text-destructive border-destructive/20"
                                    }`}
                                  >
                                    {stock.variant === "success" && <CheckCircle2 className="h-3 w-3" />}
                                    {stock.variant === "warning" && <AlertTriangle className="h-3 w-3" />}
                                    {stock.label}
                                  </Badge>
                                </div>
                              </div>
                            );

                            return canNavigate ? (
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {clickableContent}
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Click to view details & pay
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : clickableContent;
                          })()}
                          {/* Price */}
                          <div className="text-right shrink-0 space-y-1">
                            <p className={`text-lg font-bold ${isSoldOut ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {item.product ? formatPrice(item.product.unit_price, item.product.currency_code) : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">per unit</p>
                          </div>
                        </div>

                        <Separator />

                        {/* Bottom section: qty + remove */}
                        <div className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">Qty:</span>
                            <div className="flex items-center gap-1">
                              <button
                                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
                                onClick={() => handleQuantityChange(item.product_id, item.quantity - 1)}
                                disabled={item.quantity <= 1 || isSoldOut}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-10 text-center text-sm font-semibold">{item.quantity}</span>
                              <button
                                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
                                onClick={() => handleQuantityChange(item.product_id, item.quantity + 1)}
                                disabled={isSoldOut || (item.product ? item.quantity >= item.product.available_quantity : true)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
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
                          <div className="flex items-center gap-4">
                            {isSoldOut ? (
                              <span className="text-sm font-semibold text-destructive">Sold Out</span>
                            ) : (
                              <span className="text-base font-bold text-foreground">
                                {item.product ? formatPrice(item.product.unit_price * item.quantity, item.product.currency_code) : "—"}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemove(item.product_id, item.id)}
                              disabled={isRemoving}
                            >
                              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Order Summary sidebar */}
                <div className="lg:col-span-1">
                  <div className="lg:sticky lg:top-4 space-y-4">
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                      <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
                      {selected.size === 0 ? (
                        <p className="text-sm text-muted-foreground">Select items to see summary</p>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Selected Items</span>
                            <span className="font-medium">{selected.size}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-medium">{formatPrice(selectedSubtotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Service Fee</span>
                            <span className="font-medium">{formatPrice(selectedFees)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="font-bold text-foreground">Total</span>
                            <span className="text-xl font-bold text-foreground">{formatPrice(selectedTotal)}</span>
                          </div>
                        </div>
                      )}

                      <Button
                        className="w-full gap-2 rounded-xl h-12 text-base font-semibold"
                        disabled={selected.size === 0 || checkingOut}
                        onClick={handleCheckout}
                      >
                        {checkingOut ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-5 w-5" />
                        )}
                        {checkingOut ? "Processing..." : `Checkout Selected Items`}
                      </Button>
                    </div>

                    {/* Trust indicators */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      {[
                        { icon: ShieldCheck, label: "Escrow Protected", desc: "Funds held securely until you confirm" },
                        { icon: UserCheck, label: "Verified Sellers", desc: "All sellers undergo verification" },
                        { icon: Clock, label: "Confirmation Window", desc: "Time to verify before release" },
                      ].map((t, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <t.icon className="h-4 w-4 text-emerald-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.label}</p>
                            <p className="text-xs text-muted-foreground">{t.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Info banner */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
                      <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        Transactions are grouped by seller and protected individually with independent escrow.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default BuyerCart;
