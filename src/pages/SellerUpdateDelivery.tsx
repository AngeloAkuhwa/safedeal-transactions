import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Loader2, ArrowLeft, Shield, Clock, Package, Truck, CheckCircle,
  Upload, FileText, Camera, Video, AlertTriangle, Lock, Headphones,
  ShieldCheck, Receipt, ArrowRight, Info, Barcode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { useToast } from "@/hooks/use-toast";
import { getSellerTransactionDetail } from "@/services/seller-transaction-detail.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";

function fmt(amount: number | undefined | null, currency: string) {
  const val = amount ?? 0;
  const sym = currency === "NGN" ? "₦" : currency === "USD" ? "$" : `${currency} `;
  return `${sym}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const timelineSteps = [
  { key: "payment_secured", label: "Payment Secured", sub: "Funds received", icon: CheckCircle },
  { key: "funds_held", label: "Funds Held", sub: "In escrow", icon: Lock },
  { key: "seller_fulfilling", label: "Seller Fulfilling", sub: "Processing order", icon: Package },
  { key: "buyer_verification", label: "Buyer Verification", sub: "Inspect item", icon: Shield },
  { key: "funds_release", label: "Funds Release", sub: "Payout", icon: CheckCircle },
];

const evidenceTypes = [
  { label: "Courier Receipt", icon: Receipt, required: true, color: "bg-blue-50 border-blue-200 text-blue-700" },
  { label: "Tracking Proof", icon: FileText, required: true, color: "bg-purple-50 border-purple-200 text-purple-700" },
  { label: "Package Photos", icon: Camera, required: true, color: "bg-green-50 border-green-200 text-green-700" },
  { label: "Signed Receipt", icon: FileText, required: true, color: "bg-amber-50 border-amber-200 text-amber-700" },
  { label: "Video Proof", icon: Video, required: false, color: "bg-pink-50 border-pink-200 text-pink-700" },
];

export default function SellerUpdateDelivery() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [orderStatus, setOrderStatus] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const { data: dashData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-transaction-detail", transactionId],
    queryFn: () => getSellerTransactionDetail(transactionId!),
    enabled: !!transactionId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SellerNav sellerName={dashData?.seller?.full_name ?? "Seller"} avatarUrl={dashData?.seller?.avatar_url ?? null} />
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-8 text-center max-w-md">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Transaction Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">Unable to load transaction details.</p>
            <Button variant="outline" onClick={() => navigate("/seller/transactions")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Transactions
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const tx = data.transaction;
  const item = data.item;
  const pricing = data.pricing;
  const currency = pricing?.currency_code ?? "NGN";
  const itemAmount = pricing?.item_amount ?? 0;

  const statusToStep: Record<string, number> = {
    payment_secured: 2,
    seller_preparing_delivery: 2,
    seller_dispatched: 3,
    delivered_awaiting_verification: 3,
    completed: 4,
  };
  const activeStep = statusToStep[tx.status] ?? 1;

  const handleConfirmDelivery = () => {
    if (!orderStatus) {
      toast({ title: "Select order status", description: "Please select the current order status.", variant: "destructive" });
      return;
    }
    toast({ title: "Delivery Updated", description: "Delivery status has been updated successfully." });
    navigate(`/seller/transactions/${transactionId}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav sellerName={dashData?.seller?.full_name ?? "Seller"} avatarUrl={dashData?.seller?.avatar_url ?? null} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => navigate("/seller/transactions")} className="hover:text-foreground transition-colors">
            Transactions
          </button>
          <span>/</span>
          <span className="text-foreground font-medium">Update Delivery</span>
        </div>

        {/* Header Card */}
        <Card className="rounded-2xl shadow border p-6 md:p-8 space-y-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Update Delivery Status</h1>
              <p className="text-sm text-muted-foreground mt-1">Provide tracking details and proof of delivery to proceed.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 px-4 py-2 rounded-lg border border-blue-100 dark:border-blue-900">
                <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{fmt(itemAmount, currency)}</span>
              </div>
              <div className="h-8 w-px bg-border" />
              <Badge variant="outline" className="font-mono text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-900">{tx.transaction_code}</Badge>
            </div>
          </div>

          {/* Fee Breakdown */}
          {pricing && pricing.seller_net_amount > 0 && pricing.seller_net_amount !== pricing.item_amount && (
            <div className="bg-muted/50 border border-border rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payout Summary</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Item Amount</p>
                  <p className="font-semibold">{fmt(pricing.item_amount, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">SafeDeal Service Fee</p>
                  <p className="font-semibold text-destructive">−{fmt(pricing.service_fee_amount, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Your Net Payout</p>
                  <p className="font-bold text-primary">{fmt(pricing.seller_net_amount, currency)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Money Status Banner */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">MONEY STATUS</span>
              <Badge className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200 border-0 rounded-full text-[10px] px-2 py-0.5 ml-auto">
                Funds Held in Escrow
              </Badge>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">Payment is securely held by SafeDeal until buyer verification is complete.</p>
          </div>

          {/* Quick Info */}
          <div className="border-t border-border pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-lg">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase">Buyer</span>
                  <p className="font-medium">{data.buyer.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-lg">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase">Item</span>
                  <p className="font-medium">{item?.title ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-lg">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase">Date</span>
                  <p className="font-medium">{new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Transaction Progress */}
        <Card className="rounded-2xl shadow border p-6 md:p-8">
          <h2 className="text-lg font-semibold mb-6">Transaction Progress</h2>
          <div className="relative flex items-start justify-between">
            {/* Connecting line */}
            <div className="absolute top-5 left-[10%] right-[10%] h-1 bg-muted rounded-full" />
            <div
              className="absolute top-5 left-[10%] h-1 bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(((activeStep) / (timelineSteps.length - 1)) * 80, 80)}%` }}
            />
            {timelineSteps.map((step, i) => {
              const isCompleted = i < activeStep;
              const isCurrent = i === activeStep;
              return (
                <div key={step.key} className={`flex flex-col items-center flex-1 relative z-10 ${!isCompleted && !isCurrent ? "opacity-50" : ""}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 border-background transition-all ${
                    isCompleted
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                      : isCurrent
                        ? "bg-background border-primary text-primary ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                  }`}>
                    {isCurrent ? (
                      <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                    ) : (
                      <step.icon className="h-4 w-4" />
                    )}
                  </div>
                  <p className={`text-xs font-medium mt-2.5 text-center ${isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  {step.sub && (
                    <p className="text-[10px] text-muted-foreground text-center">{step.sub}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Evidence Integrity Warning */}
        <div className="bg-red-50 dark:bg-red-950/20 border-l-4 border-red-400 rounded-r-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Important: Evidence Integrity</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
              <strong>Submitting false delivery proof</strong> may lead to <strong>account suspension</strong> and loss of seller privileges. All evidence is verified and stored for dispute resolution.
            </p>
          </div>
        </div>

        {/* Delivery Details + Evidence Form */}
        <Card className="rounded-2xl shadow border overflow-hidden">
          {/* Card Header */}
          <div className="border-b bg-muted/50 px-6 py-4 flex items-center gap-3">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Delivery Details & Evidence</h2>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderStatus">Order Status</Label>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger id="orderStatus" className="rounded-xl bg-muted">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trackingNumber">Tracking Number</Label>
                <div className="relative">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="trackingNumber"
                    placeholder="e.g. 1Z999AA10123456784"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="rounded-xl bg-muted pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliveryNotes">Delivery Notes (Optional)</Label>
              <Textarea
                id="deliveryNotes"
                placeholder="Add any special instructions or details about the shipment..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                rows={3}
                className="rounded-xl bg-muted"
              />
            </div>

            {/* Evidence Types */}
            <div>
              <h3 className="text-sm font-semibold mb-3">
                Delivery Evidence <span className="text-xs text-muted-foreground font-normal ml-1">Required for protection</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {evidenceTypes.map((et) => (
                  <div key={et.label} className={`flex flex-col items-center gap-1.5 p-3 border rounded-xl text-center ${et.color}`}>
                    <et.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{et.label}</span>
                    {et.required && <span className="text-[10px] opacity-70">Required</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Upload Zone */}
            <div className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload courier receipt, tracking proof, package photos, signed delivery confirmation, or optional video proof. Max 10MB per file.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(`/seller/transactions/${transactionId}`)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDelivery}
                className="shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform"
              >
                Confirm Delivery <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </Card>

        {/* What Happens Next */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-2xl border p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Info className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">What Happens Next?</h2>
              <p className="text-sm text-muted-foreground">After you submit delivery confirmation</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { step: 1, title: "Buyer Will Be Notified", desc: "The buyer will receive notification that the item has been shipped/delivered." },
              { step: 2, title: "Buyer Verification Window Begins", desc: "The buyer will have a designated period to confirm receipt and verify the item matches the agreement." },
              { step: 3, title: "Funds Remain in Escrow", desc: `Your payment (${fmt(itemAmount, currency)}) stays securely held by SafeDeal until buyer confirms or any dispute is resolved.` },
            ].map((s) => (
              <div key={s.step} className="bg-background border rounded-xl p-4 flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {s.step}
                </div>
                <div>
                  <p className="font-medium text-sm">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
            <strong>Estimated release time:</strong> Funds will be released after buyer confirmation or automatic release after the verification window expires without disputes.
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
          {[
            { icon: Lock, title: "Secure Process", desc: "Your data is encrypted end-to-end", bgColor: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" },
            { icon: Headphones, title: "24/7 Support", desc: "Help available at any step", bgColor: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
            { icon: ShieldCheck, title: "Evidence Protection", desc: "Media securely stored for disputes", bgColor: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" },
          ].map((t) => (
            <Card key={t.title} className="p-5 flex items-start gap-3 rounded-xl">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${t.bgColor}`}>
                <t.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
