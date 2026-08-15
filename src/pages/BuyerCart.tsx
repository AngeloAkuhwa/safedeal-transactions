import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Trash2, Minus, Plus, Package, Loader2,
  ShieldCheck, AlertTriangle, CheckCircle2, ShoppingBag, RefreshCw,
  UserCheck, Clock, Info, ExternalLink, Truck,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import {
  getCartItems, removeFromCart, updateCartQuantity, checkoutSelected,
  CartItem, CartDeliverySelection, CartDeliveryAddress,
} from "@/services/cart.service";
import { useCommerceGate } from "@/hooks/useCommerceGate";
import { alwaysClaim } from "@/lib/trust/trust-claims";
import { computePricing } from "@/lib/pricing";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import { methodNeedsAddress, methodNeedsPhone } from "@/lib/delivery-methods";
import { useEffectivePricingConfigs } from "@/hooks/useEffectivePricingConfig";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { resolveDeliveryMethod } from "@/lib/status-labels";
import { FEE_NAME } from "@/lib/payment/fee-policy";

/** Currency is required — a cart row always carries its own `currency_code`. */
const formatPrice = (amount: number, currency: string) => formatMoney(amount, currency);

function getStockStatus(item: CartItem) {
  if (!item.product) return { label: "Unavailable", variant: "destructive" as const, canCheckout: false };
  // Treat units the buyer themselves has reserved (via their own pending
  // checkout session) as available — otherwise the cart row misleadingly
  // shows "Sold Out" the moment they start checking out.
  const ownReserved = item.product.own_reserved_quantity || 0;
  const avail = item.product.available_quantity + ownReserved;
  const hasPending = !!item.product.active_checkout_session_id;
  if (avail <= 0) return { label: "Sold Out", variant: "destructive" as const, canCheckout: false };
  if (hasPending) {
    return { label: "Checkout in progress", variant: "warning" as const, canCheckout: true };
  }
  if (item.quantity > avail) return { label: `Only ${avail} left — reduce qty`, variant: "warning" as const, canCheckout: false };
  if (avail <= LOW_STOCK_THRESHOLD) return { label: `Low Stock (${avail} left)`, variant: "warning" as const, canCheckout: true };
  return { label: "In Stock", variant: "success" as const, canCheckout: true };
}

function parseEnabledMethods(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [String(parsed)];
  } catch {
    return [String(raw)];
  }
}

interface DeliveryDraft {
  delivery_method: string;
  delivery_address: CartDeliveryAddress;
  contact_phone: string;
}

function emptyAddress(): CartDeliveryAddress {
  return { line1: "", line2: "", city: "", state: "", postal_code: "", country_code: "NG" };
}

function isDraftValid(draft: DeliveryDraft | undefined): boolean {
  if (!draft || !draft.delivery_method) return false;
  if (methodNeedsAddress(draft.delivery_method)) {
    const a = draft.delivery_address;
    if (!a?.line1?.trim() || !a?.city?.trim() || !a?.state?.trim()) return false;
  }
  return true;
}

const BuyerCart = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [removingSelected, setRemovingSelected] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string, DeliveryDraft>>({});
  const [showDeliveryErrors, setShowDeliveryErrors] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ productId: string; cartItemId: string } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["buyer-cart"],
    queryFn: getCartItems,
  });

  const items: CartItem[] = data?.items || [];
  const activeSessionId = data?.active_checkout_session_id || null;
  const gate = useCommerceGate(); // platform-scope gate
  const gateBlocked = !gate.loading && !gate.checkoutEnabled;
  // Quantity changes are cart mutations, so they follow the add-to-cart switch.
  // Existing rows are always preserved and always removable.
  const cartMutationsBlocked = !gate.loading && !gate.addToCartEnabled;

  // Auto-initialize delivery drafts: pre-select when only one method is offered.
  useEffect(() => {
    if (items.length === 0) return;
    setDeliveryDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const it of items) {
        if (next[it.id]) continue;
        const methods = parseEnabledMethods(it.product?.delivery_method);
        if (methods.length === 1) {
          next[it.id] = {
            delivery_method: methods[0],
            delivery_address: emptyAddress(),
            contact_phone: "",
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  const updateDraft = (cartItemId: string, patch: Partial<DeliveryDraft>) => {
    setDeliveryDrafts((prev) => {
      const current = prev[cartItemId] ?? {
        delivery_method: "",
        delivery_address: emptyAddress(),
        contact_phone: "",
      };
      return { ...prev, [cartItemId]: { ...current, ...patch } };
    });
  };

  const updateDraftAddress = (cartItemId: string, patch: Partial<CartDeliveryAddress>) => {
    setDeliveryDrafts((prev) => {
      const current = prev[cartItemId] ?? {
        delivery_method: "",
        delivery_address: emptyAddress(),
        contact_phone: "",
      };
      return {
        ...prev,
        [cartItemId]: {
          ...current,
          delivery_address: { ...current.delivery_address, ...patch },
        },
      };
    });
  };

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

  const selectableItems = items.filter(
    (i) => getStockStatus(i).canCheckout && !i.product?.active_checkout_session_id,
  );
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
    if (cartMutationsBlocked) {
      toast.error("Cart updates are paused right now. Your items are saved — you can still remove items or check out.");
      return;
    }
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
    // Validate delivery selections for each selected item
    const missingDelivery = selectedIds.filter((id) => !isDraftValid(deliveryDrafts[id]));
    if (missingDelivery.length > 0) {
      setShowDeliveryErrors(true);
      toast.error("Choose delivery options for all selected items");
      return;
    }
    const deliverySelections: CartDeliverySelection[] = selectedIds.map((id) => {
      const d = deliveryDrafts[id]!;
      const needsAddr = methodNeedsAddress(d.delivery_method);
      const needsPhone = methodNeedsPhone(d.delivery_method);
      return {
        cart_item_id: id,
        delivery_method: d.delivery_method,
        delivery_address: needsAddr ? d.delivery_address : null,
        contact_phone: needsPhone ? (d.contact_phone?.trim() || null) : null,
      };
    });
    setCheckingOut(true);
    try {
      const result = await checkoutSelected(selectedIds, deliverySelections);
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
  // Group by seller, carrying the row's own currency — never assume NGN.
  const sellerGroups = new Map<string, { amount: number; currency: string }>();
  for (const item of selectedItems) {
    const sid = item.product!.seller_id;
    const prev = sellerGroups.get(sid);
    sellerGroups.set(sid, {
      amount: (prev?.amount || 0) + item.product!.unit_price * item.quantity,
      currency: prev?.currency ?? item.product!.currency_code,
    });
  }
  const { configs: vendorConfigs, loading: pricingConfigLoading } =
    useEffectivePricingConfigs(Array.from(sellerGroups.keys()));
  let selectedFees = 0;
  for (const [sellerId, group] of sellerGroups) {
    selectedFees += computePricing(
      group.amount,
      group.currency,
      vendorConfigs[sellerId],
    ).service_fee_amount;
  }
  const selectedTotal = selectedSubtotal + selectedFees;
  // Order Summary must speak the rows' own currency, never a hardcoded NGN.
  const summaryCurrency = selectedItems[0]?.product?.currency_code ?? items[0]?.product?.currency_code ?? null;
  const mixedCurrency = new Set(selectedItems.map((i) => i.product!.currency_code)).size > 1;
  const formatSummary = (v: number) =>
    summaryCurrency && !mixedCurrency ? formatMoney(v, summaryCurrency) : "—";

  const needsAttentionCount = items.filter((i) => !getStockStatus(i).canCheckout).length;

  return (
    <div className="flex min-h-screen bg-background">
      <BuyerSidebar />
      <main className="flex-1 overflow-auto">
        <div className="sd-page sd-page-y space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="sd-page-title flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                My Cart
                {items.length > 0 && (
                  <Badge variant="outline" className="text-xs">{items.length} item{items.length !== 1 ? "s" : ""}</Badge>
                )}
              </h1>
              <p className="sd-page-sub">Review your saved items and proceed to checkout</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/marketplace")} className="gap-1.5 h-8 text-xs">
              <ShoppingBag className="h-3.5 w-3.5" />
              Continue Shopping
            </Button>
          </div>

          {!gate.loading && (cartMutationsBlocked || gateBlocked) && items.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {cartMutationsBlocked && gateBlocked
                    ? "Cart and checkout are paused"
                    : cartMutationsBlocked
                    ? "Adding to cart is paused"
                    : "Checkout is paused"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cartMutationsBlocked && gateBlocked
                    ? "Your saved items are safe and nothing has been removed. You can view and remove items, but you can't add, change quantities, or pay right now."
                    : cartMutationsBlocked
                    ? "Your saved items are safe and nothing has been removed. You can't add items or change quantities, but you can still remove items and check out."
                    : "Your saved items are safe. You can add, change and remove items, but payment is unavailable right now."}
                </p>
              </div>
            </div>
          )}

          {activeSessionId && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">You have an unfinished checkout</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Reserved stock is held for you. Resume to complete payment, or it will auto-release.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs shrink-0"
                onClick={() => navigate(`/dashboard/cart/checkout?session=${activeSessionId}`)}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Resume checkout
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h2 className="text-base font-semibold text-foreground">Your cart is empty</h2>
              <p className="text-sm text-muted-foreground">Browse the marketplace to find products</p>
              <Button size="sm" onClick={() => navigate("/dashboard/marketplace")} className="gap-1.5 h-8 text-xs">
                <ShoppingBag className="h-3.5 w-3.5" /> Browse Marketplace
              </Button>
            </div>
          ) : (
            <>
              {/* Summary stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sd-metric rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Items</p>
                    <p className="sd-kpi-value tabular-nums">{items.length}</p>
                  </div>
                </div>
                <div className="sd-metric rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Selected for Checkout</p>
                    <p className="sd-kpi-value tabular-nums text-emerald-600">{selected.size}</p>
                  </div>
                </div>
                <div className="sd-metric rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Needs Attention</p>
                    <p className="sd-kpi-value tabular-nums text-destructive">{needsAttentionCount}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                    const isLocked = !!item.product?.active_checkout_session_id;
                    const enabledMethods = parseEnabledMethods(item.product?.delivery_method);
                    const draft = deliveryDrafts[item.id];
                    const draftInvalid = isSelected && showDeliveryErrors && !isDraftValid(draft);
                    const showPicker = isSelected && !isSoldOut && !isLocked && enabledMethods.length > 0;

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
                              disabled={!stock.canCheckout || isLocked}
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
                                  {isLocked && (
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                      Finish or cancel this checkout to edit.
                                    </p>
                                  )}
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

                        {showPicker && (
                          <div className={`px-4 py-3 space-y-3 border-b border-border ${draftInvalid ? "bg-destructive/5" : ""}`}>
                            <div className="flex items-center gap-2">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              <p className="text-xs font-semibold text-foreground">Delivery method</p>
                              {draftInvalid && (
                                <span className="text-[11px] text-destructive">Required</span>
                              )}
                            </div>
                            {enabledMethods.length === 1 ? (
                              <p className="text-xs text-muted-foreground">
                                {resolveDeliveryMethod(enabledMethods[0])}
                              </p>
                            ) : (
                              <RadioGroup
                                value={draft?.delivery_method || ""}
                                onValueChange={(v) => updateDraft(item.id, { delivery_method: v })}
                                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                              >
                                {enabledMethods.map((m) => (
                                  <Label
                                    key={m}
                                    htmlFor={`dm-${item.id}-${m}`}
                                    className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer text-xs ${
                                      draft?.delivery_method === m ? "border-primary bg-primary/5" : "border-border"
                                    }`}
                                  >
                                    <RadioGroupItem id={`dm-${item.id}-${m}`} value={m} />
                                    <span>{resolveDeliveryMethod(m)}</span>
                                  </Label>
                                ))}
                              </RadioGroup>
                            )}

                            {draft?.delivery_method && methodNeedsAddress(draft.delivery_method) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Input
                                  placeholder="Address line 1 *"
                                  value={draft.delivery_address.line1 || ""}
                                  onChange={(e) => updateDraftAddress(item.id, { line1: e.target.value })}
                                  className="h-8 text-xs sm:col-span-2"
                                />
                                <Input
                                  placeholder="Address line 2"
                                  value={draft.delivery_address.line2 || ""}
                                  onChange={(e) => updateDraftAddress(item.id, { line2: e.target.value })}
                                  className="h-8 text-xs sm:col-span-2"
                                />
                                <Input
                                  placeholder="City *"
                                  value={draft.delivery_address.city || ""}
                                  onChange={(e) => updateDraftAddress(item.id, { city: e.target.value })}
                                  className="h-11 text-xs"
                                />
                                <Input
                                  placeholder="State *"
                                  value={draft.delivery_address.state || ""}
                                  onChange={(e) => updateDraftAddress(item.id, { state: e.target.value })}
                                  className="h-11 text-xs"
                                />
                                <Input
                                  placeholder="Postal code"
                                  value={draft.delivery_address.postal_code || ""}
                                  onChange={(e) => updateDraftAddress(item.id, { postal_code: e.target.value })}
                                  className="h-11 text-xs"
                                />
                              </div>
                            )}

                            {draft?.delivery_method && methodNeedsPhone(draft.delivery_method) && (
                              <Input
                                placeholder="Contact phone (optional)"
                                value={draft.contact_phone || ""}
                                onChange={(e) => updateDraft(item.id, { contact_phone: e.target.value })}
                                className="h-11 text-xs"
                              />
                            )}
                          </div>
                        )}

                        {/* Bottom section: qty + remove */}
                        <div className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">Qty:</span>
                            <div className="flex items-center gap-1">
                              <button
                                className="h-11 w-11 rounded-lg" border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
                                onClick={() => handleQuantityChange(item.product_id, item.quantity - 1)}
                                disabled={item.quantity <= 1 || isSoldOut || isLocked || cartMutationsBlocked}
                                title={cartMutationsBlocked ? "Cart updates are paused" : undefined}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-10 text-center text-sm font-semibold">{item.quantity}</span>
                              <button
                                className="h-11 w-11 rounded-lg" border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
                                onClick={() => handleQuantityChange(item.product_id, item.quantity + 1)}
                                disabled={cartMutationsBlocked || isSoldOut || isLocked || (item.product ? item.quantity >= (item.product.available_quantity + (item.product.own_reserved_quantity || 0)) : true)}
                                title={cartMutationsBlocked ? "Cart updates are paused" : undefined}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {stock.variant === "warning" && !stock.canCheckout && item.product && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11 text-xs gap-1"
                                disabled={cartMutationsBlocked}
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
                            ) : item.product?.active_checkout_session_id ? (
                              <>
                                <span className="text-base font-bold text-foreground">
                                  {item.product ? formatPrice(item.product.unit_price * item.quantity, item.product.currency_code) : "—"}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 h-8 text-xs border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                                  onClick={() => navigate(`/dashboard/cart/checkout?session=${item.product!.active_checkout_session_id}`)}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Resume checkout
                                </Button>
                              </>
                            ) : (
                              <span className="text-base font-bold text-foreground">
                                {item.product ? formatPrice(item.product.unit_price * item.quantity, item.product.currency_code) : "—"}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (isLocked) {
                                  setConfirmRemove({ productId: item.product_id, cartItemId: item.id });
                                } else {
                                  handleRemove(item.product_id, item.id);
                                }
                              }}
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
                            <span className="font-medium">{formatSummary(selectedSubtotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{FEE_NAME}</span>
                            {pricingConfigLoading
                              ? <Skeleton className="h-4 w-20" />
                              : <span className="font-medium">{formatSummary(selectedFees)}</span>}
                          </div>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="font-bold text-foreground">Total</span>
                            {pricingConfigLoading
                              ? <Skeleton className="h-6 w-28" />
                              : <span className="text-xl font-bold text-foreground">{formatSummary(selectedTotal)}</span>}
                          </div>
                        </div>
                      )}

                      <Button
                        className="w-full gap-2 rounded-xl h-12 text-base font-semibold"
                        disabled={selected.size === 0 || checkingOut || gateBlocked}
                        onClick={handleCheckout}
                        title={gateBlocked ? gate.checkoutDisabledReason : undefined}
                      >
                        {checkingOut ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-5 w-5" />
                        )}
                        {checkingOut ? "Processing..." : gateBlocked ? "Checkout unavailable" : `Checkout Selected Items`}
                      </Button>
                      {gateBlocked && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
                          {gate.checkoutDisabledReason}
                        </div>
                      )}
                    </div>

                    {/* Trust indicators */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      {[
                        { icon: ShieldCheck, label: alwaysClaim("ESCROW_PROTECTED"), desc: "Funds held securely until you confirm" },
                        { icon: UserCheck, label: "Seller Verification", desc: "Each seller's verification status is shown on their product page" },
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
                        Transactions are grouped by seller and recorded separately.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel reserved checkout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel your reserved checkout for this item and release the stock. You can re-add the product and start a new checkout afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep checkout</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRemove) {
                  const { productId, cartItemId } = confirmRemove;
                  setConfirmRemove(null);
                  handleRemove(productId, cartItemId);
                }
              }}
            >
              Cancel & remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BuyerCart;
