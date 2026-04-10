import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import {
  Loader2, ArrowLeft, Shield, Clock, Package, Truck, CheckCircle,
  Upload, AlertTriangle, Lock, Headphones, X, FileVideo, Image as ImageIcon,
  ShieldCheck, ArrowRight, Info, Barcode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { useToast } from "@/hooks/use-toast";
import { getSellerTransactionDetail } from "@/services/seller-transaction-detail.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { uploadDeliveryEvidence, updateDeliveryStatus, UploadedDeliveryFile } from "@/services/delivery.service";

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

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";
const MAX_FILES = 3;

export default function SellerUpdateDelivery() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orderStatus, setOrderStatus] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedDeliveryFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: dashData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-transaction-detail", transactionId],
    queryFn: () => getSellerTransactionDetail(transactionId!),
    enabled: !!transactionId,
  });

  const deliveryMethod = data?.transaction?.delivery_method ?? "courier";
  const isCourier = deliveryMethod === "courier";

  // Validation logic
  const isTrackingRequired =
    (orderStatus === "dispatched" && isCourier) ||
    (orderStatus === "delivered" && isCourier);
  const isEvidenceRequired = orderStatus === "delivered";
  const trackingValid = !isTrackingRequired || trackingNumber.trim().length > 0;
  const evidenceValid = !isEvidenceRequired || uploadedFiles.length > 0;
  const canSubmit = orderStatus !== "" && trackingValid && evidenceValid && uploadingNames.length === 0 && !isSubmitting;

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = MAX_FILES - uploadedFiles.length;
    if (remainingSlots <= 0) {
      toast({ title: "Upload limit reached", description: `Maximum ${MAX_FILES} files allowed.`, variant: "destructive" });
      return;
    }

    const toUpload = files.slice(0, remainingSlots);

    for (const file of toUpload) {
      const isVideo = file.type.startsWith("video/");
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({ title: "File too large", description: `${file.name} exceeds ${isVideo ? "50MB" : "10MB"} limit.`, variant: "destructive" });
        continue;
      }

      const tempKey = file.name + Date.now();
      setUploadingNames((prev) => [...prev, tempKey]);
      setUploadProgress((prev) => ({ ...prev, [tempKey]: 0 }));

      try {
        const result = await uploadDeliveryEvidence(file, (pct) => {
          setUploadProgress((prev) => ({ ...prev, [tempKey]: pct }));
        });
        setUploadedFiles((prev) => [...prev, result]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast({ title: "Upload failed", description: msg, variant: "destructive" });
      } finally {
        setUploadingNames((prev) => prev.filter((n) => n !== tempKey));
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[tempKey];
          return next;
        });
      }
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadedFiles.length, toast]);

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  };

  const handleConfirmDelivery = async () => {
    if (!orderStatus) {
      toast({ title: "Select order status", description: "Please select the current order status.", variant: "destructive" });
      return;
    }
    if (!trackingValid) {
      toast({ title: "Tracking required", description: "Please enter a tracking number for courier deliveries.", variant: "destructive" });
      return;
    }
    if (!evidenceValid) {
      toast({ title: "Evidence required", description: "Please upload at least one evidence file for delivered status.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await updateDeliveryStatus(
        transactionId!,
        orderStatus as "processing" | "dispatched" | "delivered",
        trackingNumber.trim() || null,
        deliveryNotes.trim() || null,
        uploadedFiles.map((f) => f.file_id),
      );
      toast({ title: "Delivery Updated", description: `Status updated to ${orderStatus} successfully.` });
      queryClient.invalidateQueries({ queryKey: ["seller-transaction-detail", transactionId] });
      navigate(`/seller/transactions/${transactionId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update delivery status";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

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
                  <span className="text-muted-foreground text-xs font-medium uppercase">Delivery Method</span>
                  <p className="font-medium capitalize">{deliveryMethod.replace("_", " ")}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Transaction Progress */}
        <Card className="rounded-2xl shadow border p-6 md:p-8">
          <h2 className="text-lg font-semibold mb-6">Transaction Progress</h2>
          <div className="relative flex items-start justify-between">
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

        {/* Delivery Details & Evidence Form */}
        <Card className="rounded-2xl shadow border overflow-hidden">
          <div className="border-b bg-muted/50 px-6 py-4 flex items-center gap-3">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Delivery Details & Evidence</h2>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderStatus">Order Status <span className="text-destructive">*</span></Label>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger id="orderStatus" className="rounded-xl bg-muted">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tx.status === "payment_secured" || tx.status === "seller_preparing_delivery") && (
                      <SelectItem value="processing">Processing</SelectItem>
                    )}
                    {(tx.status === "payment_secured" || tx.status === "seller_preparing_delivery") && (
                      <SelectItem value="dispatched">Dispatched</SelectItem>
                    )}
                    {(tx.status === "seller_dispatched" || tx.status === "seller_preparing_delivery") && (
                      <SelectItem value="delivered">Delivered</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trackingNumber">
                  Tracking Number {isTrackingRequired && <span className="text-destructive">*</span>}
                </Label>
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
                {isTrackingRequired && !trackingNumber.trim() && (
                  <p className="text-xs text-destructive">Tracking number is required for courier deliveries</p>
                )}
                {!isCourier && orderStatus && orderStatus !== "processing" && (
                  <p className="text-xs text-muted-foreground">Optional for {deliveryMethod.replace("_", " ")} delivery</p>
                )}
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
                maxLength={500}
              />
            </div>

            {/* Upload Evidence Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Upload Evidence {isEvidenceRequired && <span className="text-destructive">*</span>}
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    {uploadedFiles.length}/{MAX_FILES} files
                  </span>
                </h3>
              </div>

              {isEvidenceRequired && uploadedFiles.length === 0 && uploadingNames.length === 0 && (
                <p className="text-xs text-destructive">At least one evidence file is required for delivered status</p>
              )}

              {/* Uploaded files list */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((f) => (
                    <div key={f.file_id} className="flex items-center gap-3 bg-muted/50 border rounded-xl p-3">
                      {f.mime_type.startsWith("video/") ? (
                        <FileVideo className="h-5 w-5 text-purple-500 shrink-0" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-green-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.original_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{f.fingerprint}</p>
                      </div>
                      {f.mime_type.startsWith("image/") && (
                        <img src={f.secure_url} alt={f.original_name} className="h-10 w-10 rounded object-cover" />
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeFile(f.file_id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Uploading progress */}
              {uploadingNames.map((key) => (
                <div key={key} className="bg-muted/50 border rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Uploading...</span>
                    <span className="text-sm font-medium ml-auto">{uploadProgress[key] ?? 0}%</span>
                  </div>
                  <Progress value={uploadProgress[key] ?? 0} className="h-2" />
                </div>
              ))}

              {/* Upload zone */}
              {uploadedFiles.length < MAX_FILES && (
                <div
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-medium">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Images (JPEG, PNG, WEBP — max 10MB) or videos (MP4, MOV, WEBM — max 50MB). Up to {MAX_FILES} files total.
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(`/seller/transactions/${transactionId}`)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDelivery}
                disabled={!canSubmit}
                className="shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating...
                  </>
                ) : (
                  <>
                    Confirm Delivery <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
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
