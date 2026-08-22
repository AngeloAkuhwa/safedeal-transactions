import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Check, Shield, Clock, Lock, FileText, Share2, Copy,
  Mail, MessageSquare, Smartphone, MoreHorizontal,
  AlertTriangle, Eye, ArrowLeft, Send, CheckCircle,
  CreditCard, Vault,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/format";
import { FEE_NAME } from "@/lib/payment/fee-policy";
import { MISSING_MONEY } from "@/lib/payment/money-format";
import { cn } from "@/lib/utils";
import { TONE } from "@/lib/tone";

interface TransactionSuccessProps {
  publishedUrl: string;
  form: {
    buyer_name: string;
    buyer_contact: string;
    item_title: string;
    item_description: string;
    item_quantity: number;
    item_condition: string;
    price: number;
    currency_code: string;
    delivery_method: string;
    expected_delivery_date: string;
    verification_window_hours: number;
  };
  pricing: {
    service_fee_amount: number;
    seller_net_amount: number;
    total_amount: number;
    /**
     * Whether a ceiling actually bound THIS calculation, decided by the
     * vendor's effective config upstream. Never re-derived here against a
     * platform default: a vendor with a lower cap must still see the badge.
     */
    is_capped?: boolean;
  } | null;
  currSymbol: string;
  transactionCode: string;
  deliveryLabel: string;
  conditionLabel: string;
}

export function TransactionSuccess({
  publishedUrl,
  form,
  pricing,
  currSymbol,
  transactionCode,
  deliveryLabel,
  conditionLabel,
}: TransactionSuccessProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}${publishedUrl}`;
  // With no pricing snapshot there is no fee truth to show. Render "—"
  // rather than implying a 0% fee and a 100% payout.
  const sellerNet = pricing ? pricing.seller_net_amount : null;
  const feePercent = pricing && form.price > 0
    ? `${((pricing.service_fee_amount / form.price) * 100).toFixed(1)}%`
    : MISSING_MONEY;

  const formattedDate = form.expected_delivery_date
    ? new Date(form.expected_delivery_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const fmt = (amount: number) => formatMoney(amount, form.currency_code);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast({ title: "Link copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = `Hi ${form.buyer_name}, here's the secure SafeDeal transaction link for "${form.item_title}": ${fullUrl}`;

  return (
    <div className="flex-1">
      {/* ── Hero ── */}
      <section className="border-b border-border bg-muted/40 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-6 animate-in zoom-in duration-500">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success shadow-xl">
              <Check className="h-10 w-10 text-success-foreground" strokeWidth={3} />
            </div>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-3">Private Offer Created</h1>
          <p className="text-lg text-muted-foreground mb-6">Share the secure offer link below with your buyer to start the protected transaction.</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-5 py-2.5">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Offer Status: Awaiting Buyer Claim</span>
            </div>
            <button
              onClick={() => navigate("/seller/offers")}
              className="inline-flex items-center gap-2 bg-card border border-border rounded-full px-5 py-2.5 hover:bg-muted transition-colors min-h-11"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">View in Private Offers</span>
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 py-6">
        {/* ── Important Reminder Banner ── */}
        <div className="bg-gradient-to-r from-primary to-primary/90 rounded-2xl shadow-lg p-6 lg:p-8">
          <div className="flex items-start gap-4">
            <Shield className="flex-shrink-0 h-6 w-6 text-primary-foreground" />
            <div className="flex-1">
              <h3 className="mb-2 text-xl font-bold text-primary-foreground">Transaction starts when the buyer pays</h3>
              <p className="text-primary-foreground/90 text-sm leading-relaxed">
                We don't create a live transaction until the buyer opens this link and accepts the agreement. Funds enter escrow only after they pay through the secure flow. At that point all terms become immutable.
              </p>
            </div>
          </div>
        </div>

        {/* ── Transaction Summary Card ── */}
        <Card className="rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-primary/90 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="h-6 w-6 text-primary-foreground" />
                <div>
                  <p className="text-xs text-primary-foreground/70 font-medium">Offer Token</p>
                  <p className="font-mono text-xl font-bold text-primary-foreground">{transactionCode}</p>
                </div>
              </div>
              <div className="rounded-lg bg-primary-foreground/20 px-4 py-2 backdrop-blur-sm">
                <span className="text-xs font-medium text-primary-foreground">Private Offer</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <Lock className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-bold text-foreground">Immutable Transaction Summary</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Buyer Information</p>
                  <p className="text-base font-semibold text-foreground">{form.buyer_name || "—"}</p>
                  <p className="text-sm text-muted-foreground">{form.buyer_contact || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Item Details</p>
                  <p className="text-base font-semibold text-foreground">{form.item_title || "—"}</p>
                  <p className="text-sm text-muted-foreground">Condition: {conditionLabel}</p>
                  <p className="text-sm text-muted-foreground">Quantity: {form.item_quantity}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Payment Details</p>
                  <p className="text-2xl font-bold text-foreground">{fmt(form.price)}</p>
                  <p className="text-sm text-muted-foreground">Currency: {form.currency_code}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Delivery Method</p>
                  <p className="text-base font-semibold text-foreground">{deliveryLabel}</p>
                  <p className="text-sm text-muted-foreground">Expected: {formattedDate}</p>
                  <p className="text-sm text-muted-foreground">Verification Window: {form.verification_window_hours} Hours</p>
                </div>
              </div>
            </div>

            {/* Pricing breakdown */}
            <div className="bg-muted rounded-xl p-4 border border-border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Transaction Amount</span>
                <span className="text-base font-semibold text-foreground">{fmt(form.price)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  {FEE_NAME} ({feePercent})
                  {pricing?.is_capped && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">capped</Badge>
                  )}
                </span>
                <span className="text-base font-semibold text-foreground">{pricing ? fmt(pricing.service_fee_amount) : MISSING_MONEY}</span>
              </div>
              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-foreground">You'll Receive</span>
                  <span className="text-2xl font-bold text-foreground">{sellerNet != null ? fmt(sellerNet) : MISSING_MONEY}</span>
                </div>
              </div>
            </div>

            {/* Protection note */}
            <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground mb-1">Agreement Protection</p>
                  <p className="text-xs text-muted-foreground">This agreement will be locked after the buyer makes payment. All details become immutable to protect both parties.</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Share Secure Link ── */}
        <Card className="rounded-2xl shadow-lg p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
            <Share2 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-2xl font-bold text-foreground">Share Private Offer Link</h2>
              <p className="text-sm text-muted-foreground">Send this unique offer link to the buyer through a private channel</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-foreground mb-3">Private Offer Link</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Input
                  readOnly
                  value={fullUrl}
                  className="px-4 py-3 pr-12 rounded-xl bg-muted font-mono text-sm"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <Button
                onClick={handleCopy}
                className={`px-6 py-3 rounded-xl font-semibold shadow-lg gap-2 ${copied ? "bg-success hover:bg-success/90" : ""}`}
              >
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-primary" />
              This link is unique and secure. Only share it with the buyer.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-foreground mb-3">Share via</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => window.open(`mailto:${form.buyer_contact.includes("@") ? form.buyer_contact : ""}?subject=SafeDeal Transaction&body=${encodeURIComponent(shareText)}`)}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-xl hover:bg-muted hover:border-primary transition-all"
              >
                <Mail className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">Email</span>
              </button>
              <button
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`)}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-xl hover:border-primary hover:bg-muted transition-all"
              >
                <MessageSquare className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">WhatsApp</span>
              </button>
              <button
                onClick={() => window.open(`sms:?body=${encodeURIComponent(shareText)}`)}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-xl hover:bg-muted hover:border-primary transition-all"
              >
                <Smartphone className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">SMS</span>
              </button>
              <button
                onClick={() => navigator.share?.({ title: "SafeDeal Transaction", text: shareText, url: fullUrl }).catch(() => {})}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-xl hover:bg-muted hover:border-muted-foreground transition-all"
              >
                <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">More</span>
              </button>
            </div>
          </div>

          <div className={cn("rounded-xl border p-4", TONE.warning.surface)}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={cn("mt-0.5 h-5 w-5 flex-shrink-0", TONE.warning.icon)} />
              <div className="flex-1">
                <p className="mb-1 text-sm font-semibold text-foreground">Security Notice</p>
                <p className="text-xs text-muted-foreground">Never share this link publicly. Only send it directly to the buyer through a secure channel. The buyer must review and pay through this link for the transaction to proceed.</p>
              </div>
            </div>
          </div>
        </Card>

        {/* ── What Happens Next ── */}
        <section className="bg-card border border-border rounded-2xl shadow-lg p-6 lg:p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center gap-2 bg-primary/10 rounded-full px-4 py-2 mb-4">
              <Share2 className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Transaction Flow</span>
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-2">What Happens Next?</h2>
            <p className="text-muted-foreground">Step-by-step guide to your SafeDeal transaction</p>
          </div>

          <div className="relative">
            <div className="absolute bottom-16 left-8 top-16 hidden w-0.5 bg-gradient-to-b from-primary to-muted md:block" />

            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg relative z-rail">
                  <span className="text-2xl font-bold text-primary-foreground">1</span>
                </div>
                <div className="flex-1 bg-card border-2 border-primary/30 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Share2 className="h-4 w-4 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">You Send Secure Link to Buyer</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">Share the unique transaction link with {form.buyer_name || "the buyer"} through email, WhatsApp, SMS, or your preferred secure channel.</p>
                  <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-1.5">
                    <CheckCircle className="h-3 w-3 text-primary" />
                    <span className="text-xs font-semibold text-primary">Action Required Now</span>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg relative z-rail">
                  <span className="text-2xl font-bold text-primary-foreground">2</span>
                </div>
                <div className="flex-1 bg-card border-2 border-border rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-lg font-bold text-foreground">Buyer Reviews Locked Pre-Payment Agreement</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">The buyer opens your link and reviews all transaction details including item description, images, price, delivery terms, and verification window.</p>
                  <div className="bg-muted border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <Lock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-foreground">Protection Note:</strong> All details become immutable after payment to protect both parties.</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-6">
                <div className="relative z-rail flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary shadow-lg">
                  <span className="text-2xl font-bold text-primary-foreground">3</span>
                </div>
                <div className="flex-1 bg-card border-2 border-border rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-lg font-bold text-foreground">Buyer Pays Through SafeDeal</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">The buyer completes secure payment directly through the SafeDeal platform. You'll receive instant notification when payment is received.</p>
                  <div className={cn("rounded-lg border p-3", TONE.warning.surface)}>
                    <p className="flex items-start gap-2 text-xs text-foreground">
                      <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0", TONE.warning.icon)} />
                      <span><strong>Critical:</strong> Payment must go through SafeDeal's secure link. Payments outside this system are not protected.</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-16 h-16 bg-muted rounded-2xl flex items-center justify-center shadow-lg relative z-rail">
                  <span className="text-2xl font-bold text-muted-foreground">4</span>
                </div>
                <div className="flex-1 bg-muted/50 border-2 border-border rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Vault className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-lg font-bold text-muted-foreground">Funds Held Securely in Escrow</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">After payment, SafeDeal holds the {fmt(form.price)} securely in escrow. The agreement is now locked and you can begin fulfillment with confidence.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-card rounded-lg p-3 border border-border">
                      <p className="text-xs text-muted-foreground mb-1">You'll receive</p>
                      <p className="text-base font-bold text-foreground">{sellerNet != null ? fmt(sellerNet) : MISSING_MONEY}</p>
                    </div>
                    <div className="bg-card rounded-lg p-3 border border-border">
                      <p className="text-xs text-muted-foreground mb-1">After buyer confirms</p>
                      <p className="text-base font-bold text-foreground">Item received</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Protection active note */}
          <div className="mt-8 rounded-2xl border-2 border-border bg-muted/40 p-6">
            <div className="flex items-start gap-4">
              <Shield className="flex-shrink-0 h-5 w-5 text-primary-foreground" />
              <div className="flex-1">
                <h4 className="text-lg font-bold text-foreground mb-2">SafeDeal Protection Active After Payment</h4>
                <p className="text-sm text-muted-foreground">Once the buyer pays through the link, the agreement locks and the transaction moves to fulfillment. Release remains subject to the recorded delivery, dispute, and payment states.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Next Action Card ── */}
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-6 shadow-lg lg:p-8">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-primary rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <Send className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Next Action Required</span>
                <span className="w-2 h-2 bg-primary rounded-full sd-live-dot" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Send Link to Buyer</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Share the secure transaction link with {form.buyer_name || "the buyer"}. Once they review and make payment, you'll be notified to proceed with fulfillment.
              </p>

              <div className="bg-card/60 backdrop-blur-sm rounded-xl p-4 mb-4 border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm">1</div>
                  <p className="text-sm font-semibold text-foreground">Buyer reviews transaction details</p>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center text-muted-foreground font-bold text-sm">2</div>
                  <p className="text-sm text-muted-foreground">Buyer makes secure payment</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center text-muted-foreground font-bold text-sm">3</div>
                  <p className="text-sm text-muted-foreground">Funds held in escrow: you fulfill order</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Awaiting buyer payment</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex flex-col sm:flex-row gap-4 pb-8">
          <Button
            onClick={() => navigate("/seller/transactions")}
            className="flex-1 px-8 py-6 rounded-xl font-semibold shadow-lg gap-3 text-base"
          >
            <Eye className="h-5 w-5" />
            View Transaction
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/seller")}
            className="flex-1 px-8 py-6 rounded-xl font-semibold border-2 gap-3 text-base"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
