import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, ArrowLeft, Save, ArrowRight, Send, Shield, Lock,
  Upload, CheckCircle, AlertTriangle, Clock, FileText, User, Package,
  CreditCard, Truck, StickyNote, X, ImageIcon, Video, Link,
} from "lucide-react";
import { TransactionSuccess } from "@/components/seller/TransactionSuccess";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import {
  getSellerDrafts,
  saveDraft,
  publishTransaction,
  uploadProductFile,
  checkImageResolution,
  type CreateTransactionData,
  type DraftTransaction,
  type UploadedFile,
} from "@/services/create-transaction.service";
import { useToast } from "@/hooks/use-toast";
import { computePricing } from "@/lib/pricing";
import { useEffectivePricingConfig } from "@/hooks/useEffectivePricingConfig";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import { useMediaConfig } from "@/hooks/useMediaConfig";
import { formatMaxMb } from "@/lib/media-rules";
import { FEE_NAME } from "@/lib/payment/fee-policy";


const STEP_LABELS = ["Buyer Info", "Item Details", "Payment", "Delivery", "Notes"];
const STEP_ICONS = [User, Package, CreditCard, Truck, StickyNote];

const CONDITION_OPTIONS = [
  { value: "brand_new", label: "Brand New" },
  { value: "like_new", label: "Like New" },
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "used", label: "Used" },
];

const DELIVERY_OPTIONS = [
  { value: "courier", label: "Courier / Standard Shipping" },
  { value: "pickup", label: "Buyer Pickup" },
  { value: "meetup", label: "Meet-Up in Person" },
  { value: "hand_delivery", label: "Hand Delivery (in person)" },
];

const VERIFICATION_WINDOWS = [
  { value: 24, label: "24 Hours" },
  { value: 48, label: "48 Hours" },
  { value: 72, label: "72 Hours (3 Days)" },
  { value: 168, label: "7 Days" },
  { value: 336, label: "14 Days" },
];

const CURRENCY_OPTIONS = [
  { value: "NGN", label: "NGN (₦)", symbol: "₦" },
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
];

const MAX_PHOTOS = 3;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

const defaultForm: CreateTransactionData = {
  buyer_name: "",
  buyer_contact: "",
  item_title: "",
  item_description: "",
  item_quantity: 1,
  item_condition: "brand_new",
  price: 0,
  currency_code: "NGN",
  delivery_method: "courier",
  expected_delivery_date: "",
  verification_window_hours: 72,
  seller_notes: "",
};

const SellerCreateTransaction = () => {
  const { config: mediaConfig } = useMediaConfig();
  const navigate = useNavigate();
  const { toast } = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<CreateTransactionData>({ ...defaultForm });
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string>("");

  // Upload state — with local preview URLs
  const [photos, setPhotos] = useState<(UploadedFile & { preview_url: string })[]>([]);
  const [video, setVideo] = useState<(UploadedFile & { preview_url: string }) | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  const isDirty = JSON.stringify(form) !== JSON.stringify(defaultForm) || photos.length > 0 || video !== null;

  const { data: navData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  const { data: draftsData } = useQuery({
    queryKey: ["seller-drafts"],
    queryFn: getSellerDrafts,
    staleTime: 30_000,
  });

  const drafts = draftsData ?? [];

  const saveDraftMutation = useMutation({
    mutationFn: (data: CreateTransactionData) =>
      saveDraft({
        ...data,
        transaction_id: transactionId ?? undefined,
        file_ids: [...photos.map((p) => p.file_id), ...(video ? [video.file_id] : [])],
      }),
    onSuccess: (result) => {
      setTransactionId(result.transaction_id);
      toast({ title: "Draft saved", description: "Your transaction draft has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (txId: string) => publishTransaction(txId),
    onSuccess: (result: any) => {
      // New private-offer flow returns offer_url; fall back to share_url for legacy.
      setPublishedUrl(result.offer_url || result.share_url || "");
      setPublishedCode(result.offer_token || result.transaction_code || "");
      toast({ title: "Private offer created!", description: "Share the offer link with your buyer." });
    },
    onError: (err: Error) => {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    },
  });

  const updateField = useCallback((field: keyof CreateTransactionData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationError(null);
  }, []);

  const loadDraft = (draft: DraftTransaction) => {
    // The server no longer fabricates condition / currency / window / price on
    // the load path. A missing value returns the field to its untouched wizard
    // state so the seller must set it — it is never presented as their choice.
    setForm({
      buyer_name: draft.buyer_name,
      buyer_contact: draft.buyer_contact,
      item_title: draft.item_title,
      item_description: draft.item_description,
      item_quantity: draft.item_quantity,
      item_condition: draft.item_condition ?? defaultForm.item_condition,
      price: draft.price ?? defaultForm.price,
      currency_code: draft.currency_code ?? defaultForm.currency_code,
      delivery_method: draft.delivery_method ?? defaultForm.delivery_method,
      expected_delivery_date: draft.expected_delivery_date ?? defaultForm.expected_delivery_date,
      verification_window_hours: draft.verification_window_hours ?? defaultForm.verification_window_hours,
      seller_notes: draft.seller_notes,
    });
    setTransactionId(draft.transaction_id);
    setShowDraftBanner(false);
    setCurrentStep(1);
  };

  // ── Photo upload handler ──
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (!files.length) return;

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast({ title: "Limit reached", description: `Maximum ${MAX_PHOTOS} photos allowed.`, variant: "destructive" });
      return;
    }

    const toUpload = files.slice(0, remaining);

    for (const file of toUpload) {
      if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
        toast({ title: "Invalid format", description: `${file.name} is not a valid image (JPEG, PNG, WEBP only).`, variant: "destructive" });
        continue;
      }
      if (file.size > mediaConfig.imageMaxBytes) {
        toast({ title: "File too large", description: `${file.name} exceeds the ${formatMaxMb(mediaConfig.imageMaxBytes)} limit.`, variant: "destructive" });
        continue;
      }
      // Resolution check
      const goodRes = await checkImageResolution(file);
      if (!goodRes) {
        toast({ title: "Low quality", description: `${file.name} must be at least 400×400 pixels.`, variant: "destructive" });
        continue;
      }

      try {
        setUploadingPhoto(true);
        setPhotoProgress(0);
        const previewUrl = URL.createObjectURL(file);
        const uploaded = await uploadProductFile(file, (pct) => setPhotoProgress(pct));
        setPhotos((prev) => [...prev, { ...uploaded, preview_url: previewUrl }]);
        toast({ title: "Photo uploaded", description: file.name });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      } finally {
        setUploadingPhoto(false);
        setPhotoProgress(0);
      }
    }
  };

  // ── Video upload handler ──
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (!file) return;

    if (video) {
      toast({ title: "Limit reached", description: "Only 1 video allowed. Remove existing video first.", variant: "destructive" });
      return;
    }
    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
      toast({ title: "Invalid format", description: "Only MP4, MOV, or WEBM videos are accepted.", variant: "destructive" });
      return;
    }
    if (file.size > mediaConfig.videoMaxBytes) {
      toast({ title: "File too large", description: `Video must be under ${formatMaxMb(mediaConfig.videoMaxBytes)}.`, variant: "destructive" });
      return;
    }

    try {
      setUploadingVideo(true);
      setVideoProgress(0);
      const previewUrl = URL.createObjectURL(file);
      const uploaded = await uploadProductFile(file, (pct) => setVideoProgress(pct));
      setVideo({ ...uploaded, preview_url: previewUrl });
      toast({ title: "Video uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingVideo(false);
      setVideoProgress(0);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      const removed = prev[idx];
      if (removed?.preview_url) URL.revokeObjectURL(removed.preview_url);
      return prev.filter((_, i) => i !== idx);
    });
  };
  const removeVideo = () => {
    if (video?.preview_url) URL.revokeObjectURL(video.preview_url);
    setVideo(null);
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!form.buyer_name.trim()) { setValidationError("Buyer name is required."); return false; }
        if (!form.buyer_contact.trim()) { setValidationError("Buyer email or phone is required."); return false; }
        return true;
      case 2:
        if (!form.item_title.trim()) { setValidationError("Item title is required."); return false; }
        if (!form.item_description.trim()) { setValidationError("Item description is required."); return false; }
        if (photos.length === 0 && !video) {
          setValidationError("Please upload at least one product photo or video as evidence.");
          return false;
        }
        return true;
      case 3:
        if (!form.price || form.price <= 0) { setValidationError("Please enter a valid price."); return false; }
        return true;
      case 4:
        if (!form.expected_delivery_date) { setValidationError("Expected delivery date is required."); return false; }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((s) => Math.min(s + 1, 5));
    }
  };

  const handleBack = () => {
    if (currentStep === 1 && isDirty) {
      setShowAbandonModal(true);
    } else if (currentStep === 1) {
      navigate("/seller/transactions");
    } else {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSaveDraft = () => {
    saveDraftMutation.mutate(form);
  };

  const handlePublish = async () => {
    if (!transactionId) {
      const result = await saveDraft({
        ...form,
        file_ids: [...photos.map((p) => p.file_id), ...(video ? [video.file_id] : [])],
      });
      setTransactionId(result.transaction_id);
      publishMutation.mutate(result.transaction_id);
    } else {
      await saveDraft({
        ...form,
        transaction_id: transactionId,
        file_ids: [...photos.map((p) => p.file_id), ...(video ? [video.file_id] : [])],
      });
      publishMutation.mutate(transactionId);
    }
  };

  const currentUserId = useCurrentUserId();
  const { config: vendorPricingConfig, loading: pricingConfigLoading } = useEffectivePricingConfig(currentUserId);
  const pricing = form.price > 0 ? computePricing(form.price, form.currency_code, vendorPricingConfig) : null;
  const currSymbol = CURRENCY_OPTIONS.find((c) => c.value === form.currency_code)?.symbol ?? "₦";
  const progressPct = (currentStep / 5) * 100;

  if (publishedUrl) {
    const conditionLabel = CONDITION_OPTIONS.find((c) => c.value === form.item_condition)?.label ?? form.item_condition;
    const deliveryLabel = DELIVERY_OPTIONS.find((d) => d.value === form.delivery_method)?.label ?? form.delivery_method;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SellerNav sellerName={navData?.seller.full_name ?? "Seller"} avatarUrl={navData?.seller.avatar_url ?? null} />
        <TransactionSuccess
          publishedUrl={publishedUrl}
          form={form}
          pricing={pricing ? { service_fee_amount: pricing.service_fee_amount, seller_net_amount: pricing.item_amount - pricing.platform_fee_amount, total_amount: pricing.total_amount, is_capped: pricing.is_capped } : null}
          currSymbol={currSymbol}
          transactionCode={publishedCode}
          deliveryLabel={deliveryLabel}
          conditionLabel={conditionLabel}
        />
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav sellerName={navData?.seller.full_name ?? "Seller"} avatarUrl={navData?.seller.avatar_url ?? null} />

      {/* Hero */}
      <div className="bg-gradient-to-br from-sky-50 via-background to-green-50 dark:from-sky-950/20 dark:via-background dark:to-green-950/20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-sm font-medium text-muted-foreground mb-1">Private Offer</p>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Create Private Offer</h1>
          <p className="text-muted-foreground mt-1">Build a buyer-specific private offer. The link is unique to one buyer and never appears in your public storefront.</p>
          <div className="flex flex-wrap gap-3 mt-4">
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-primary/30 text-primary">
              <Lock className="h-3.5 w-3.5" /> Private buyer link
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-success/30 text-success">
              <Shield className="h-3.5 w-3.5" /> Escrow on payment
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-warning/30 text-warning">
              <CheckCircle className="h-3.5 w-3.5" /> Hidden from marketplace
            </Badge>
          </div>
        </div>
      </div>

      {/* Draft resume banner */}
      {showDraftBanner && drafts.length > 0 && !transactionId && (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-4">
          <Alert className="border-primary/30 bg-primary/5">
            <FileText className="h-4 w-4 text-primary" />
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-sm text-foreground flex-1">
                You have <strong>{drafts.length}</strong> unfinished draft{drafts.length > 1 ? "s" : ""}.
              </span>
              <div className="flex gap-2 flex-wrap">
                {drafts.slice(0, 3).map((d) => (
                  <Button key={d.transaction_id} variant="outline" size="sm" onClick={() => loadDraft(d)} className="text-xs">
                    Continue {d.transaction_code}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setShowDraftBanner(false)} className="text-xs text-muted-foreground">
                  Start New
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main content */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 flex-1">
        {/* Step indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Step <span className="text-primary font-bold">{currentStep} of 5</span>
            </span>
            <span className="text-sm font-semibold text-foreground">{STEP_LABELS[currentStep - 1]}</span>
          </div>
          <Progress value={progressPct} className="h-2" />
          <div className="flex justify-between mt-4">
            {STEP_LABELS.map((label, idx) => {
              const step = idx + 1;
              const Icon = STEP_ICONS[idx];
              const isCompleted = step < currentStep;
              const isActive = step === currentStep;
              return (
                <button
                  key={label}
                  onClick={() => { if (step < currentStep) setCurrentStep(step); }}
                  className="flex flex-col items-center gap-1.5 group"
                  disabled={step > currentStep}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all
                    ${isCompleted ? "bg-primary text-primary-foreground" : ""}
                    ${isActive ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : ""}
                    ${!isCompleted && !isActive ? "bg-muted text-muted-foreground" : ""}
                  `}>
                    {isCompleted ? <CheckCircle className="h-5 w-5" /> : step}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Validation error */}
        {validationError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {/* Step 1: Buyer Info */}
        {currentStep === 1 && (
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-6 space-y-6">
              {/* Step header */}
              <div className="flex items-center gap-4 pb-4 mb-2 border-b border-border">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Buyer Information</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Enter the buyer's contact details to get started</p>
                </div>
              </div>

              {/* Form fields */}
              <div className="space-y-2">
                <Label htmlFor="buyer-name" className="text-sm font-semibold">Buyer Full Name <span className="text-destructive">*</span></Label>
                <Input id="buyer-name" className="px-4 py-3 rounded-xl" placeholder="Enter buyer's full name" value={form.buyer_name} onChange={(e) => updateField("buyer_name", e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1.5">This will appear on the transaction agreement</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyer-contact" className="text-sm font-semibold">Buyer Email or Phone <span className="text-destructive">*</span></Label>
                <Input id="buyer-contact" className="px-4 py-3 rounded-xl" placeholder="email@example.com or +1234567890" value={form.buyer_contact} onChange={(e) => updateField("buyer_contact", e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1.5">The secure transaction link will be sent to this contact</p>
              </div>

              {/* Inline info card */}
              <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
                <Link className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-foreground">Secure Transaction Link</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    After creating this transaction, you'll receive a secure link to share with the buyer. They'll use this link to review all details and complete payment safely through SafeDeal.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Item Details */}
        {currentStep === 2 && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-2xl shadow-md">
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Item Details</h2>
                    <p className="text-sm text-muted-foreground mt-1">Describe what you're selling</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item-title">Item Title <span className="text-destructive">*</span></Label>
                    <Input id="item-title" placeholder="e.g. iPhone 15 Pro Max 256GB" value={form.item_title} onChange={(e) => updateField("item_title", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item-desc">Item Description <span className="text-destructive">*</span></Label>
                    <Textarea id="item-desc" placeholder="Describe the item in detail..." rows={4} value={form.item_description} onChange={(e) => updateField("item_description", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="quantity">Quantity <span className="text-destructive">*</span></Label>
                      <Input id="quantity" type="number" min={1} value={form.item_quantity} onChange={(e) => updateField("item_quantity", Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Product Condition <span className="text-destructive">*</span></Label>
                      <Select value={form.item_condition} onValueChange={(v) => updateField("item_condition", v)}>
                        <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
                        <SelectContent>
                          {CONDITION_OPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Photo upload */}
                  <div className="space-y-2">
                    <Label>Product Photos <span className="text-destructive">*</span> <span className="text-muted-foreground font-normal">({photos.length}/{MAX_PHOTOS})</span></Label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                    {/* Uploaded previews */}
                    {photos.length > 0 && (
                      <div className="flex gap-3 flex-wrap">
                        {photos.map((p, i) => (
                          <div key={p.file_id} className="relative group w-24 h-24 rounded-xl overflow-hidden border border-border">
                            <img
                              src={p.preview_url}
                              alt={p.original_name}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              aria-label={`Remove ${p.original_name}`}
                              onClick={() => removePhoto(i)}
                              className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                              {p.original_name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Upload progress */}
                    {uploadingPhoto && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading photo… {photoProgress}%
                        </div>
                        <Progress value={photoProgress} className="h-1.5" />
                      </div>
                    )}
                    {/* Upload zone */}
                    {photos.length < MAX_PHOTOS && !uploadingPhoto && (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                      >
                        <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">Click to upload photos</p>
                        <p className="text-xs text-muted-foreground mt-1">JPEG, PNG or WEBP • Max {formatMaxMb(mediaConfig.imageMaxBytes)} each • Min 400×400px</p>
                      </button>
                    )}
                  </div>

                  {/* Video upload */}
                  <div className="space-y-2">
                    <Label>Product Video <span className="text-destructive">*</span> <span className="text-muted-foreground font-normal">(1 max)</span></Label>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      className="hidden"
                      onChange={handleVideoSelect}
                    />
                    {video && (
                      <div className="flex items-center gap-3 bg-muted rounded-xl p-3 border border-border">
                        <Video className="h-8 w-8 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{video.original_name}</p>
                          <p className="text-xs text-muted-foreground">{video.fingerprint}</p>
                        </div>
                        <button onClick={removeVideo} className="p-1 hover:bg-destructive/10 rounded-full">
                          <X className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    )}
                    {uploadingVideo && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading video… {videoProgress}%
                        </div>
                        <Progress value={videoProgress} className="h-1.5" />
                      </div>
                    )}
                    {!video && !uploadingVideo && (
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                      >
                        <Video className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Click to upload product video — MP4, MOV or WEBM (max {formatMaxMb(mediaConfig.videoMaxBytes)})</p>
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground">Upload at least one photo or video to proceed.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div>
              <Card className="rounded-2xl shadow-md border-warning/20 bg-warning/5">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    <h3 className="font-semibold text-foreground text-sm">Fraud Prevention</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Upload accurate product photos and a clear description because these become part of the locked evidence record. This protects both you and the buyer.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 3: Payment Details */}
        {currentStep === 3 && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-2xl shadow-md">
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Payment Details</h2>
                    <p className="text-sm text-muted-foreground mt-1">Set the agreed transaction amount</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="price">Agreed Price <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">{currSymbol}</span>
                        <Input id="price" type="number" min={0} step={0.01} className="pl-8" value={form.price || ""} onChange={(e) => updateField("price", parseFloat(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Currency <span className="text-destructive">*</span></Label>
                      <Select value={form.currency_code} onValueChange={(v) => updateField("currency_code", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {pricing && pricingConfigLoading && (
                    <div className="bg-muted/50 rounded-xl p-4 space-y-2 border">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-5 w-2/3" />
                    </div>
                  )}
                  {pricing && !pricingConfigLoading && (
                    <div className="bg-muted/50 rounded-xl p-4 space-y-2 border">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Item Price</span>
                        <span className="font-medium text-foreground">{formatMoney(pricing.item_amount, form.currency_code)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{FEE_NAME} ({(pricing.service_fee_rate * 100).toFixed(1)}%)</span>
                        <span className="font-medium text-foreground">{formatMoney(pricing.service_fee_amount, form.currency_code)}</span>
                      </div>
                      <hr className="border-border" />
                      <div className="flex justify-between text-sm font-bold">
                        <span className="text-foreground">You'll Receive</span>
                        <span className="text-success">{formatMoney(pricing.item_amount - pricing.platform_fee_amount, form.currency_code)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-md border-primary/20 bg-primary/5">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">Payment release terms</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Payment will be held securely until the buyer confirms receipt and satisfaction with the item.
                  </p>
                </CardContent>
              </Card>
            </div>
            <div>
              <Card className="rounded-2xl shadow-md border-warning/20 bg-warning/5">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-warning" />
                    <h3 className="font-semibold text-foreground text-sm">Agreement Lock After Payment</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Once the buyer pays, all transaction details become locked and cannot be edited by either party. This includes:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" /> Item description and photos</li>
                    <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" /> Agreed price and payment amount</li>
                    <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" /> Delivery terms and verification window</li>
                    <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" /> All uploaded evidence and documentation</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 4: Delivery Details */}
        {currentStep === 4 && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-2xl shadow-md">
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Delivery Details</h2>
                    <p className="text-sm text-muted-foreground mt-1">Set delivery expectations and verification window</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Delivery Method <span className="text-destructive">*</span></Label>
                    <Select value={form.delivery_method} onValueChange={(v) => updateField("delivery_method", v)}>
                      <SelectTrigger><SelectValue placeholder="Select delivery method" /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_OPTIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="delivery-date">Expected Delivery Date <span className="text-destructive">*</span></Label>
                    <Input id="delivery-date" type="date" value={form.expected_delivery_date} onChange={(e) => updateField("expected_delivery_date", e.target.value)} min={new Date().toISOString().split("T")[0]} />
                    <p className="text-xs text-muted-foreground">Estimated date when the buyer should receive the item</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Verification Window <span className="text-destructive">*</span></Label>
                    <Select value={String(form.verification_window_hours)} onValueChange={(v) => updateField("verification_window_hours", parseInt(v))}>
                      <SelectTrigger><SelectValue placeholder="Select verification window" /></SelectTrigger>
                      <SelectContent>
                        {VERIFICATION_WINDOWS.map((w) => (
                          <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Time the buyer has to verify the item after delivery</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="rounded-2xl shadow-md border-primary/20 bg-primary/5">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">SafeDeal-Mediated Release</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    If the buyer doesn't respond within the verification window after delivery, SafeDeal will review the transaction and release funds to you.
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-md border-success/20 bg-success/5">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-success" />
                    <h3 className="font-semibold text-foreground text-sm">Seller Protection</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Delivery proof helps protect you against false disputes. Upload tracking numbers, delivery photos, or signed receipts when you fulfill this order.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 5: Seller Notes + Summary */}
        {currentStep === 5 && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-2xl shadow-md">
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Seller Notes</h2>
                    <p className="text-sm text-muted-foreground mt-1">Add any additional instructions or information</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="seller-notes">Additional Instructions (Optional)</Label>
                    <Textarea id="seller-notes" placeholder="Any additional notes for the buyer..." rows={5} value={form.seller_notes} onChange={(e) => updateField("seller_notes", e.target.value)} />
                    <p className="text-xs text-muted-foreground">This information will be visible to the buyer when they review the transaction</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="rounded-2xl shadow-md">
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-semibold text-foreground text-sm">Transaction Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Buyer:</span><span className="font-medium text-foreground truncate ml-2">{form.buyer_name || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Item:</span><span className="font-medium text-foreground truncate ml-2">{form.item_title || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-medium text-foreground">{form.price > 0 ? formatMoney(form.price, form.currency_code) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Media:</span><span className="font-medium text-foreground">{photos.length} photo{photos.length !== 1 ? "s" : ""}{video ? ", 1 video" : ""}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Delivery:</span><span className="font-medium text-foreground">{DELIVERY_OPTIONS.find((d) => d.value === form.delivery_method)?.label ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">You'll Receive:</span>{pricing && pricingConfigLoading ? <Skeleton className="h-4 w-20" /> : <span className="font-bold text-success">{pricing ? formatMoney(pricing.item_amount - pricing.platform_fee_amount, form.currency_code) : "—"}</span>}</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-md border-success/20 bg-success/5">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <h3 className="font-semibold text-foreground text-sm">Ready to Create</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Review your transaction details above. Once created, you'll receive a secure link to share with the buyer.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Bottom action bar */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t gap-3 flex-wrap">
          <Button variant="outline" onClick={handleBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {currentStep === 1 ? "Cancel" : "Back"}
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleSaveDraft} disabled={saveDraftMutation.isPending || uploadingPhoto || uploadingVideo} className="gap-2">
              {saveDraftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </Button>
            {currentStep < 5 ? (
              <Button onClick={handleNext} disabled={uploadingPhoto || uploadingVideo} className="gap-2">
                Next Step
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handlePublish}
                disabled={publishMutation.isPending || saveDraftMutation.isPending || uploadingPhoto || uploadingVideo}
                className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
              >
                {publishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Create Transaction
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Abandon modal */}
      <Dialog open={showAbandonModal} onOpenChange={setShowAbandonModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abandon Transaction?</DialogTitle>
            <DialogDescription>Your progress will be lost if you leave without saving as draft.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { handleSaveDraft(); setShowAbandonModal(false); navigate("/seller/transactions"); }}>
              Save as Draft
            </Button>
            <Button variant="destructive" onClick={() => navigate("/seller/transactions")}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default SellerCreateTransaction;
