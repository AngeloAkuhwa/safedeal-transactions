import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft, Lock, ShieldCheck, Package, Loader2, CheckCircle2, Shield, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { supabase } from "@/integrations/supabase/client";
import { computePricing } from "@/lib/pricing";

function formatPrice(amount: number, currency = "NGN") {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString()}`;
  return `${currency} ${Number(amount).toLocaleString()}`;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function fetchCheckoutSession(sessionId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  // Fetch checkout session items via direct query (buyer has RLS access)
  const { data: session, error: sErr } = await supabase
    .from("checkout_sessions" as any)
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sErr) throw sErr;

  const { data: sessionItems, error: siErr } = await supabase
    .from("checkout_session_items" as any)
    .select("*")
    .eq("checkout_session_id", sessionId);

  if (siErr) throw siErr;

  return { session, items: sessionItems || [] };
}

const CartCheckoutReview = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["checkout-session", sessionId],
    queryFn: () => fetchCheckoutSession(sessionId!),
    enabled: !!sessionId,
  });

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

  const { session, items } = data;

  // Group items by seller
  const sellerGroups = new Map<string, any[]>();
  for (const item of items) {
    const key = item.seller_id;
    if (!sellerGroups.has(key)) sellerGroups.set(key, []);
    sellerGroups.get(key)!.push(item);
  }

  const handleConfirmPay = async () => {
    setIsSubmitting(true);
    try {
      // For now, get the first transaction's share token and redirect to payment
      // In a full implementation, initiate-paystack-payment would accept checkout_session_id
      const { data: txLinks } = await supabase
        .from("transaction_links" as any)
        .select("share_token, transaction_id")
        .in("transaction_id", items.map((i: any) => i.transaction_id).filter(Boolean));

      if (txLinks && txLinks.length > 0) {
        // For single-seller checkout, redirect to payment directly
        const shareToken = txLinks[0].share_token;
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

          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Review & Pay</h1>
            <p className="text-sm text-muted-foreground mt-1">Review your grouped order before payment</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items — 2/3 */}
            <div className="lg:col-span-2 space-y-5">
              {Array.from(sellerGroups.entries()).map(([sellerId, sellerItems]) => {
                const sellerSubtotal = sellerItems.reduce((sum: number, i: any) => sum + Number(i.line_total), 0);
                const sellerPricing = computePricing(sellerSubtotal);

                return (
                  <div key={sellerId} className={`${glassPanel} p-5 space-y-4`}>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">S</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-foreground text-sm">Seller Order</p>
                        <p className="text-xs text-muted-foreground">Transaction will be created for this seller</p>
                      </div>
                    </div>

                    <div className="divide-y divide-border">
                      {sellerItems.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Product Item</p>
                            <p className="text-xs text-muted-foreground">Qty: {item.quantity} × {formatPrice(Number(item.unit_price))}</p>
                          </div>
                          <span className="font-semibold text-foreground text-sm">{formatPrice(Number(item.line_total))}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-border pt-3 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">{formatPrice(sellerSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Protection Fee</span>
                        <span className="font-medium">{formatPrice(sellerPricing.service_fee_amount)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Payment summary — 1/3 */}
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
                        <span className="text-muted-foreground">Total Protection Fee</span>
                        <p className="text-[10px] text-muted-foreground">Non-refundable</p>
                      </div>
                      <span className="font-medium">{formatPrice(Number(session.total_protection_fee))}</span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between">
                      <span className="font-bold">Total</span>
                      <span className="text-xl font-bold">{formatPrice(Number(session.total_amount))}</span>
                    </div>
                  </div>
                </div>

                {/* Trust card */}
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-emerald-500" />
                    <span className="font-semibold text-foreground text-sm">SafeDeal Protection</span>
                  </div>
                  <ul className="space-y-1.5">
                    {["Separate escrow per seller", "Independent fulfillment tracking", "Full refund if items don't match"].map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  size="lg"
                  className="w-full gap-2 rounded-xl h-12 text-base font-semibold bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-primary-foreground shadow-lg shadow-primary/20"
                  onClick={handleConfirmPay}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                  {isSubmitting ? "Processing..." : "Confirm & Pay"}
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
