import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Loader2, ArrowLeft, Shield, Clock, Package, Truck, CheckCircle,
  Upload, FileText, Camera, Video, AlertTriangle, Lock, Headphones,
  ShieldCheck, Receipt,
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
  { key: "buyer_verification", label: "Buyer Verification", sub: "", icon: Shield },
  { key: "funds_release", label: "Funds Release", sub: "", icon: CheckCircle },
];

const evidenceTypes = [
  { label: "Courier Receipt", icon: Receipt, required: true },
  { label: "Tracking Proof", icon: FileText, required: true },
  { label: "Package Photos", icon: Camera, required: true },
  { label: "Signed Receipt", icon: FileText, required: true },
  { label: "Video Proof", icon: Video, required: false },
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

  // Timeline progress: map transaction status to step index
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

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => navigate("/seller/transactions")} className="hover:text-foreground transition-colors">
            Transactions
          </button>
          <span>/</span>
          <span className="text-foreground font-medium">Update Delivery</span>
        </div>

        {/* Header Card */}
        <Card className="p-6 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold">Update Delivery Status</h1>
              <p className="text-sm text-muted-foreground mt-1">Provide tracking details and proof of delivery to proceed.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{fmt(itemAmount, currency)}</span>
              <Badge variant="outline" className="font-mono text-xs">{tx.transaction_code}</Badge>
            </div>
          </div>

          {/* Fee Breakdown — shown when seller net differs from item amount */}
          {pricing && pricing.seller_net_amount > 0 && pricing.seller_net_amount !== pricing.item_amount && (
            <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fee Breakdown</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Item Amount</p>
                  <p className="font-semibold">{fmt(pricing.item_amount, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Processing Fee</p>
                  <p className="font-semibold text-destructive">−{fmt(pricing.payment_processing_fee_amount, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Platform Fee</p>
                  <p className="font-semibold text-destructive">−{fmt(pricing.platform_fee_amount, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Your Net Payout</p>
                  <p className="font-bold text-primary">{fmt(pricing.seller_net_amount, currency)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Money Status Banner */}
          <div className="bg-accent/50 border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">MONEY STATUS</span>
            </div>
            <p className="text-sm font-medium">Funds Held in Escrow</p>
            <p className="text-xs text-muted-foreground">Payment is securely held by SafeDeal until buyer verification is complete.</p>
          </div>

          {/* Quick Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs font-medium uppercase">Buyer</span>
              <p className="font-medium">{data.buyer.name}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs font-medium uppercase">Item</span>
              <p className="font-medium">{item?.title ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs font-medium uppercase">Date</span>
              <p className="font-medium">{new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
          </div>
        </Card>

        {/* Transaction Progress */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Transaction Progress</h2>
          <div className="flex items-start justify-between gap-2 overflow-x-auto">
            {timelineSteps.map((step, i) => {
              const isActive = i < activeStep;
              const isCurrent = i === activeStep;
              return (
                <div key={step.key} className="flex flex-col items-center flex-1 min-w-[80px]">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isActive ? "bg-primary border-primary text-primary-foreground" :
                    isCurrent ? "border-primary text-primary bg-background" :
                    "border-muted text-muted-foreground bg-background"
                  }`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <p className={`text-xs font-medium mt-2 text-center ${isActive || isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
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
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Important: Evidence Integrity</p>
            <p className="text-xs text-muted-foreground mt-1">
              Submitting false delivery proof may lead to account suspension and loss of seller privileges. All evidence is verified and stored for dispute resolution.
            </p>
          </div>
        </div>

        {/* Delivery Details Form */}
        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-semibold">Delivery Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderStatus">Order Status</Label>
              <Select value={orderStatus} onValueChange={setOrderStatus}>
                <SelectTrigger id="orderStatus">
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
              <Input
                id="trackingNumber"
                placeholder="e.g. 1Z999AA10123456784"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
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
            />
          </div>
        </Card>

        {/* Evidence Upload */}
        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-semibold">
            Delivery Evidence <span className="text-xs text-muted-foreground font-normal ml-1">Required for protection</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {evidenceTypes.map((et) => (
              <div key={et.label} className="flex flex-col items-center gap-1.5 p-3 border border-border rounded-lg bg-muted/30 text-center">
                <et.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium">{et.label}</span>
              </div>
            ))}
          </div>

          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload courier receipt, tracking proof, package photos, signed delivery confirmation, or optional video proof. Max 10MB per file.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate(`/seller/transactions/${transactionId}`)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmDelivery}>
              Confirm Delivery
            </Button>
          </div>
        </Card>

        {/* What Happens Next */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">What Happens Next?</h2>
          <p className="text-sm text-muted-foreground">After you submit delivery confirmation</p>

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <div>
                <p className="font-medium text-sm">Buyer Will Be Notified</p>
                <p className="text-xs text-muted-foreground">The buyer will receive notification that the item has been shipped/delivered.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <div>
                <p className="font-medium text-sm">Buyer Verification Window Begins</p>
                <p className="text-xs text-muted-foreground">The buyer will have a designated period to confirm receipt and verify the item matches the agreement.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">3</div>
              <div>
                <p className="font-medium text-sm">Funds Remain in Escrow</p>
                <p className="text-xs text-muted-foreground">
                  Your payment ({fmt(itemAmount, currency)}) stays securely held by SafeDeal until buyer confirms or any dispute is resolved.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <strong>Estimated release time:</strong> Funds will be released after buyer confirmation or automatic release after the verification window expires without disputes.
          </div>
        </Card>

        {/* Trust Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Lock, title: "Secure Process", desc: "Your data is encrypted end-to-end" },
            { icon: Headphones, title: "24/7 Support", desc: "Help available at any step" },
            { icon: ShieldCheck, title: "Evidence Protection", desc: "Media securely stored for disputes" },
          ].map((t) => (
            <Card key={t.title} className="p-4 flex items-start gap-3">
              <t.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t.title}</p>
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
