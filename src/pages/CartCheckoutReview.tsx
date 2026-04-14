import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft, Lock, ShieldCheck, Package, Loader2, CheckCircle2, Shield,
  ChevronDown, ChevronUp, Info, Users, CreditCard, Truck, AlertCircle,
  Phone, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { supabase } from "@/integrations/supabase/client";
import { computePricing } from "@/lib/pricing";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function formatPrice(amount: number, currency = "NGN") {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString()}`;
  return `${currency} ${Number(amount).toLocaleString()}`;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ProductInfo {
  id: string;
  title: string;
  short_description: string | null;
  primary_image: string | null;
  stock_quantity: number;
  reserved_quantity: number;
  status: string;
}

interface SellerInfo {
  id: string;
  display_name: string | null;
  phone_verified: boolean | null;
}

async function fetchCheckoutSession(sessionId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: ANON_KEY,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/checkout_sessions?id=eq.${sessionId}&select=*`, { headers });
  const sessions = await res.json();
  if (!sessions || sessions.length === 0) throw new Error("Session not found");
  const session = sessions[0];

  const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/checkout_session_items?checkout_session_id=eq.${sessionId}&select=*`, { headers });
  const sessionItems: any[] = (await itemsRes.json()) || [];

  // Collect unique product and seller IDs
  const productIds = [...new Set(sessionItems.map((i) => i.product_id))];
  const sellerIds = [...new Set(sessionItems.map((i) => i.seller_id))];

  // Fetch products and sellers in parallel
  const [productsRes, sellersRes] = await Promise.all([
    productIds.length > 0
      ? fetch(`${SUPABASE_URL}/rest/v1/products?id=in.(${productIds.join(",")})&select=id,title,short_description,primary_image,stock_quantity,reserved_quantity,status`, { headers })
      : Promise.resolve(null),
    sellerIds.length > 0
      ? fetch(`${SUPABASE_URL}/rest/v1/profiles?id=in.(${sellerIds.join(",")})&select=id,display_name,phone_verified`, { headers })
      : Promise.resolve(null),
  ]);

  const products: ProductInfo[] = productsRes ? await productsRes.json() : [];
  const sellers: SellerInfo[] = sellersRes ? await sellersRes.json() : [];

  const productMap = new Map(products.map((p) => [p.id, p]));
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  return { session, items: sessionItems, productMap, sellerMap };
}

const GRADIENT_COLORS = [
  "from-primary to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
];

const CartCheckoutReview = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openBreakdowns, setOpenBreakdowns] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["checkout-session", sessionId],
    queryFn: () => fetchCheckoutSession(sessionId!),
    enabled: !!sessionId,
  });

  const toggleBreakdown = (sellerId: string) => {
    setOpenBreakdowns((prev) => ({ ...prev, [sellerId]: !prev[sellerId] }));
  };

  // Empty / loading / error states
  if (!sessionId) {
    return (
      <div className="flex min-h-screen bg-background">
        <BuyerSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto" />
            <h1 className="text-2xl font-bold">No checkout session</h1>
            <Button onClick={() => navigate("/dashboard/cart")}>Back to Cart</Button>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <BuyerSidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (isError || !data?.session) {
    return (
      <div className="flex min-h-screen bg-background">
        <BuyerSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto" />
            <h1 className="text-2xl font-bold">Session not found</h1>
            <Button onClick={() => navigate("/dashboard/cart")}>Back to Cart</Button>
          </div>
        </main>
      </div>
    );
  }

  const { session, items, productMap, sellerMap } = data;

  // Group items by seller
  const sellerGroups = new Map<string, any[]>();
  for (const item of items) {
    const key = item.seller_id;
    if (!sellerGroups.has(key)) sellerGroups.set(key, []);
    sellerGroups.get(key)!.push(item);
  }

  const totalItems = items.reduce((sum: number, i: any) => sum + i.quantity, 0);
  const sellerCount = sellerGroups.size;

  const handleConfirmPay = async () => {
    setIsSubmitting(true);
    try {
      const txIds = items.map((i: any) => i.transaction_id).filter(Boolean);
      const { data: txLinks } = await supabase
        .from("transaction_links" as any)
        .select("share_token, transaction_id")
        .in("transaction_id", txIds);

      if (txLinks && txLinks.length > 0) {
        const shareToken = (txLinks[0] as any).share_token;
        toast.success("Redirecting to payment...");
        navigate(`/t/${shareToken}/pay`);
      } else {
        toast.error("No transaction links found");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const glassPanel = "bg-card/60 backdrop-blur-sm border border-border rounded-2xl";

  return (
    <div className="flex min-h-screen bg-background">
      <BuyerSidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header */}
          <header className="flex items-center justify-between">
            <button
              onClick={() => navigate("/dashboard/cart")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Cart
            </button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">Secure Checkout</span>
            </div>
          </header>

          {/* Title */}
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Review & Pay</h1>
            <p className="text-sm text-muted-foreground mt-1">Review your grouped order before payment</p>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              You are making <span className="font-semibold">one payment</span> for multiple protected seller orders. Each seller will have an independent escrow and delivery tracking.
            </p>
          </div>

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Package className="h-3.5 w-3.5" />
                Selected Items
              </div>
              <p className="text-xl font-bold text-foreground">{totalItems}</p>
            </div>
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3.5 w-3.5" />
                Seller Groups
              </div>
              <p className="text-xl font-bold text-foreground">{sellerCount}</p>
            </div>
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <CreditCard className="h-3.5 w-3.5" />
                Subtotal
              </div>
              <p className="text-xl font-bold text-foreground">{formatPrice(Number(session.subtotal_amount))}</p>
            </div>
            <div className={`${glassPanel} p-4`}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Shield className="h-3.5 w-3.5" />
                Protection Fee
              </div>
              <p className="text-xl font-bold text-primary">{formatPrice(Number(session.total_protection_fee))}</p>
            </div>
          </div>

          {/* Fee calculation info */}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" />
            SafeDeal calculates protection fees separately for each seller order, then combines them into one checkout total.
          </p>

          {/* Main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Seller groups — 2/3 */}
            <div className="lg:col-span-2 space-y-5">
              {Array.from(sellerGroups.entries()).map(([sellerId, sellerItems], idx) => {
                const seller = sellerMap.get(sellerId);
                const sellerName = seller?.display_name || "Unknown Seller";
                const sellerInitial = sellerName.charAt(0).toUpperCase();
                const phoneVerified = seller?.phone_verified ?? false;
                const gradient = GRADIENT_COLORS[idx % GRADIENT_COLORS.length];

                const sellerSubtotal = sellerItems.reduce((sum: number, i: any) => sum + Number(i.line_total), 0);
                const sellerPricing = computePricing(sellerSubtotal);
                const groupItemCount = sellerItems.reduce((sum: number, i: any) => sum + i.quantity, 0);
                const isOpen = openBreakdowns[sellerId] ?? false;

                return (
                  <div key={sellerId} className={`${glassPanel} overflow-hidden`}>
                    {/* Seller header */}
                    <div className="p-5 flex items-start gap-4">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback className={`bg-gradient-to-br ${gradient} text-white font-bold text-base`}>
                          {sellerInitial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{sellerName}</p>
                          {phoneVerified ? (
                            <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                              <Phone className="h-2.5 w-2.5" /> Phone Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
                              <BadgeCheck className="h-2.5 w-2.5" /> Verified Seller
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">A protected transaction will be created for this seller</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{groupItemCount} item{groupItemCount !== 1 ? "s" : ""}</p>
                        <p className="text-sm font-semibold text-foreground">{formatPrice(sellerSubtotal)}</p>
                      </div>
                    </div>

                    {/* Product items */}
                    <div className="px-5 pb-2 divide-y divide-border">
                      {sellerItems.map((item: any) => {
                        const product = productMap.get(item.product_id);
                        const title = product?.title || "Product Item";
                        const desc = product?.short_description || "";
                        const image = product?.primary_image;
                        const stockQty = (product?.stock_quantity ?? 0) - (product?.reserved_quantity ?? 0);
                        const isLowStock = stockQty > 0 && stockQty <= 5;

                        return (
                          <div key={item.id} className="flex gap-3 py-3">
                            {/* Thumbnail */}
                            <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden shrink-0">
                              {image ? (
                                <img src={image} alt={title} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  <Package className="h-6 w-6 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{title}</p>
                              {desc && <p className="text-xs text-muted-foreground truncate">{desc}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                                {stockQty > 0 && (
                                  <Badge variant={isLowStock ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                                    {isLowStock ? `Low Stock (${stockQty})` : "In Stock"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-foreground">{formatPrice(Number(item.line_total))}</p>
                              <p className="text-[10px] text-muted-foreground">{formatPrice(Number(item.unit_price))} each</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Collapsible fee breakdown */}
                    <Collapsible open={isOpen} onOpenChange={() => toggleBreakdown(sellerId)}>
                      <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3 border-t border-border text-sm hover:bg-muted/50 transition-colors">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5 text-primary" />
                          Protection Fee Breakdown
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-primary">{formatPrice(sellerPricing.service_fee_amount)}</span>
                          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-5 pb-4 pt-1 space-y-2 bg-muted/30">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Paystack Processing Fee</span>
                            <span className="font-medium">{formatPrice(sellerPricing.paystack_fee_amount)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">SafeDeal Platform Fee</span>
                            <span className="font-medium">{formatPrice(sellerPricing.platform_fee_amount)}</span>
                          </div>
                          <div className="border-t border-border pt-2 flex justify-between text-xs font-semibold">
                            <span className="text-foreground">Total Protection Fee</span>
                            <span className="text-primary">{formatPrice(sellerPricing.service_fee_amount)}</span>
                          </div>
                          <div className="flex flex-col gap-1 pt-1">
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Non-refundable fee
                            </p>
                            {sellerPricing.is_capped && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Fee capped at ₦2,500
                              </p>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </div>

            {/* Payment summary sidebar — 1/3 */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-4 space-y-4">
                <div className={`${glassPanel} p-5 space-y-4`}>
                  <h2 className="text-lg font-semibold text-foreground">Payment Summary</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Items Subtotal</span>
                      <span className="font-medium">{formatPrice(Number(session.subtotal_amount))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <div>
                        <span className="text-primary font-medium">Protection Fee</span>
                        <p className="text-[10px] text-muted-foreground">Non-refundable</p>
                      </div>
                      <span className="font-medium text-primary">{formatPrice(Number(session.total_protection_fee))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <div>
                        <span className="text-muted-foreground">Delivery Fee</span>
                        <p className="text-[10px] text-muted-foreground">Per seller</p>
                      </div>
                      <span className="text-xs italic text-muted-foreground">Calculated after payment</span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between items-end">
                      <span className="font-bold text-foreground">Total Amount</span>
                      <span className="text-2xl font-bold text-foreground">{formatPrice(Number(session.total_amount))}</span>
                    </div>
                  </div>
                </div>

                {/* SafeDeal Protection card */}
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    <span className="font-semibold text-foreground text-sm">SafeDeal Protection</span>
                  </div>
                  <ul className="space-y-2">
                    {[
                      "Separate escrow per seller",
                      "Independent fulfillment tracking",
                      "Full refund if items don't match",
                      "Dispute resolution support",
                    ].map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <Button
                  size="lg"
                  className="w-full gap-2 rounded-xl h-12 text-base font-semibold bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground shadow-lg shadow-primary/20"
                  onClick={handleConfirmPay}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                  {isSubmitting ? "Processing..." : `Confirm & Pay ${formatPrice(Number(session.total_amount))}`}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By confirming, you agree to SafeDeal's{" "}
                  <span className="text-primary hover:underline cursor-pointer">Terms of Service</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CartCheckoutReview;
