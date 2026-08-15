import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Save, Upload, Loader2, ImagePlus, X, AlertCircle, RotateCcw,
  Info, ImageIcon, Banknote, Handshake, Eye, Globe, Users, Lock, ShieldCheck,
  CloudUpload, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { SellerStorefrontSidebar } from "@/components/storefront/SellerStorefrontSidebar";
import { MediaRequirementsPanel } from "@/components/seller/MediaRequirementsPanel";
import { ProductPhotoCropDialog, type PendingPhoto } from "@/components/seller/ProductPhotoCropDialog";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIN_DIMENSION,
  readImageDimensions,
  validateProductImageStandard,
} from "@/lib/image-quality";
import { useMediaConfig } from "@/hooks/useMediaConfig";
import { useVendorPlan } from "@/hooks/useVendorPlan";
import { SidebarProvider } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/sonner";
import { createProduct, getProductCategories } from "@/services/seller-storefront.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { uploadProductFile } from "@/services/create-transaction.service";

const DELIVERY_OPTIONS = [
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Delivery" },
  { value: "courier_shipping", label: "Courier / Shipping" },
  { value: "digital", label: "Digital / Instant" },
  { value: "hand_delivery", label: "Hand Delivery" },
  { value: "meetup", label: "Meetup" },
];

interface FileEntry {
  file_id: string;
  media_type: string;
  preview_url: string;
  name: string;
  status: "uploading" | "done" | "error";
  progress: number;
  localPreview?: string;
  originalFile?: File;
}

const SellerProductCreate = () => {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  // Photos wait here until the seller frames them to a square.
  const [cropQueue, setCropQueue] = useState<PendingPhoto[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [conditionLabel, setConditionLabel] = useState("");
  const [sku, setSku] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("1");
  const [agreementTerms, setAgreementTerms] = useState("");
  const [deliveryMethods, setDeliveryMethods] = useState<string[]>([]);
  const [verificationWindowHours, setVerificationWindowHours] = useState("");
  const [sellerNotes, setSellerNotes] = useState("");
  const [visibilityType, setVisibilityType] = useState("public");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [featureHighlights, setFeatureHighlights] = useState<{ title: string; description: string }[]>([]);
  const [deliveryScope, setDeliveryScope] = useState("");
  const [estimatedDeliveryDays, setEstimatedDeliveryDays] = useState("");
  const { config: mediaConfig } = useMediaConfig();
  const { state: planState } = useVendorPlan();
  // Photo capacity is a PLAN limit, enforced server-side. Surfacing it here
  // stops the server rejecting a listing after the seller already paid the
  // upload bandwidth. When the plan has not loaded we fall back to the media
  // config cap rather than inventing a number.
  const planPhotoSlots =
    planState
      ? (planState.plans.find((p) => p.code === planState.current.plan_code)?.photo_slots ?? null)
      : null;
  const effectiveMaxImages =
    planPhotoSlots === null
      ? mediaConfig.productMaxImages
      : Math.min(mediaConfig.productMaxImages, planPhotoSlots + planState!.current.extra_photo_slots);
  const acceptAttr = [
    ...mediaConfig.imageAllowedFormats.map((f) => `image/${f}`),
    ...mediaConfig.videoAllowedFormats.map((f) => `video/${f}`),
  ].join(",");
  const { data: dashData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  const { data: categories } = useQuery({
    queryKey: ["product-categories"],
    queryFn: getProductCategories,
    staleTime: 300_000,
  });

  const createMutation = useMutation({
    mutationFn: (status: string) =>
      createProduct({
        title,
        category_id: categoryId,
        short_description: shortDescription || undefined,
        description,
        condition_label: conditionLabel || undefined,
        sku: sku || undefined,
        brand: brand || undefined,
        model: model || undefined,
        unit_price: parseFloat(unitPrice),
        original_price: originalPrice ? parseFloat(originalPrice) : undefined,
        stock_quantity: parseInt(stockQuantity) || 0,
        agreement_terms: agreementTerms || undefined,
        delivery_methods: deliveryMethods.length > 0 ? deliveryMethods : undefined,
        verification_window_hours: verificationWindowHours
          ? parseInt(verificationWindowHours)
          : undefined,
        seller_notes: sellerNotes || undefined,
        visibility_type: visibilityType,
        feature_highlights: featureHighlights.filter(f => f.title.trim()),
        delivery_scope: deliveryScope || undefined,
        estimated_delivery_days: estimatedDeliveryDays || undefined,
        file_ids: files.filter((f) => f.status === "done").map((f) => ({ file_id: f.file_id, media_type: f.media_type })),
        status,
      }),
    onSuccess: () => {
      toast.success("Product created successfully!");
      navigate("/seller/storefront");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;
    const fileArray = Array.from(selectedFiles);

    // Enforce max 3 images + 1 video
    const currentImages = files.filter((f) => f.media_type === "image").length;
    const currentVideos = files.filter((f) => f.media_type === "video").length;
    const filtered: File[] = [];
    for (const file of fileArray) {
      const isVideo = file.type.startsWith("video/");
      if (isVideo) {
        if (currentVideos + filtered.filter((f) => f.type.startsWith("video/")).length >= mediaConfig.productMaxVideos) {
          toast.error(`Maximum ${mediaConfig.productMaxVideos} video${mediaConfig.productMaxVideos === 1 ? "" : "s"} allowed.`);
          continue;
        }
      } else {
        if (currentImages + filtered.filter((f) => !f.type.startsWith("video/")).length >= effectiveMaxImages) {
          toast.error(
            planPhotoSlots !== null && effectiveMaxImages < mediaConfig.productMaxImages
              ? `Your plan includes ${effectiveMaxImages} photo slots. Buy extra slots to add more.`
              : `Maximum ${effectiveMaxImages} images allowed.`,
          );
          continue;
        }
      }
      filtered.push(file);
    }
    if (!filtered.length) return;
    e.target.value = "";

    // The SafeDeal Image Standard applies to product PHOTOS: validate the raw
    // pixels first, then route them through the 1:1 crop step. Videos upload
    // straight away.
    const photos: File[] = [];
    const passthrough: File[] = [];
    for (const file of filtered) {
      if (file.type.startsWith("video/")) { passthrough.push(file); continue; }
      try {
        const dims = await readImageDimensions(file);
        const res = validateProductImageStandard(
          { ...dims, bytes: file.size },
          { minDimension: PRODUCT_IMAGE_MIN_DIMENSION, maxBytes: PRODUCT_IMAGE_MAX_BYTES },
        );
        if (!res.ok) { toast.error(res.errors[0].message); continue; }
        photos.push(file);
      } catch {
        // Unreadable locally — let the server be the judge.
        passthrough.push(file);
      }
    }

    if (photos.length) {
      setCropQueue((prev) => [
        ...prev,
        ...photos.map((file) => ({
          id: `crop-${Date.now()}-${Math.random()}`,
          file,
          objectUrl: URL.createObjectURL(file),
        })),
      ]);
    }
    if (passthrough.length) startUploads(passthrough);
  };

  const startUploads = (filtered: File[]) => {
    if (!filtered.length) return;
    const newEntries: FileEntry[] = filtered.map((file) => ({
      file_id: `temp-${Date.now()}-${Math.random()}`,
      media_type: file.type.startsWith("video/") ? "video" : "image",
      preview_url: URL.createObjectURL(file),
      localPreview: URL.createObjectURL(file),
      name: file.name,
      status: "uploading" as const,
      progress: 0,
      originalFile: file,
    }));

    setFiles((prev) => [...prev, ...newEntries]);
    setUploading(true);
    let activeUploads = filtered.length;

    for (let i = 0; i < filtered.length; i++) {
      const file = filtered[i];
      const tempId = newEntries[i].file_id;
      uploadProductFile(file, (pct) => {
        setFiles((prev) => prev.map((f) => (f.file_id === tempId ? { ...f, progress: pct } : f)));
      })
        .then((result) => {
          if (result.normalised) {
            toast.info(
              `${file.name} was padded with a white border to fit ${mediaConfig.imageAllowedRatios[0]}. ` +
              `Nothing was cropped — remove it and re-upload a square photo if you'd rather crop it yourself.`,
            );
          }
          setFiles((prev) =>
            prev.map((f) =>
              f.file_id === tempId
                ? { ...f, file_id: result.file_id, preview_url: result.secure_url, status: "done" as const, progress: 100, originalFile: undefined }
                : f
            )
          );
        })
        .catch((err) => {
          setFiles((prev) => prev.map((f) => (f.file_id === tempId ? { ...f, status: "error" as const, progress: 0 } : f)));
          toast.error(`Failed to upload ${file.name}: ${err.message}`);
        })
        .finally(() => {
          activeUploads--;
          if (activeUploads <= 0) setUploading(false);
        });
    }
  };

  const dequeueCrop = (id: string) => {
    setCropQueue((prev) => {
      const match = prev.find((p) => p.id === id);
      if (match) URL.revokeObjectURL(match.objectUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleCropConfirm = (id: string, file: File) => {
    dequeueCrop(id);
    startUploads([file]);
  };

  const retryUpload = async (idx: number) => {
    const entry = files[idx];
    if (!entry.originalFile) return;
    const file = entry.originalFile;
    const tempId = entry.file_id;
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, status: "uploading" as const, progress: 0 } : f)));
    setUploading(true);
    try {
      const result = await uploadProductFile(file, (pct) => {
        setFiles((prev) => prev.map((f) => (f.file_id === tempId ? { ...f, progress: pct } : f)));
      });
      setFiles((prev) =>
        prev.map((f) =>
          f.file_id === tempId
            ? { ...f, file_id: result.file_id, preview_url: result.secure_url, status: "done" as const, progress: 100, originalFile: undefined }
            : f
        )
      );
    } catch (err: any) {
      setFiles((prev) => prev.map((f) => (f.file_id === tempId ? { ...f, status: "error" as const, progress: 0 } : f)));
      toast.error(`Retry failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Drafts save with any media state; only publishing requires the minimum
  // image count. This mirrors the server gate in seller-products.
  const readyImageCount = files.filter((f) => f.media_type === "image" && f.status === "done").length;
  const hasEnoughImages = readyImageCount >= mediaConfig.productMinImagesToPublish;

  /**
   * Every publish blocker, each anchored to the field that causes it. The old
   * build gated on four conditions but only ever surfaced one of them, through
   * a `title` tooltip on a DISABLED button — which has no touch equivalent and
   * is suppressed by mobile browsers, so publishing simply did nothing.
   */
  const publishBlockers: { field: string; message: string }[] = [
    title.trim().length < 2
      ? { field: "title", message: "Product title needs at least 2 characters." }
      : null,
    description.trim().length < 10
      ? { field: "desc", message: "Full description needs at least 10 characters." }
      : null,
    !unitPrice || !(parseFloat(unitPrice) > 0)
      ? { field: "price", message: "Set a unit price greater than ₦0." }
      : null,
    !hasEnoughImages
      ? {
          field: "media",
          message: `Add at least ${mediaConfig.productMinImagesToPublish} photos to publish (you have ${readyImageCount}).`,
        }
      : null,
  ].filter(Boolean) as { field: string; message: string }[];

  const blockerFor = (field: string) => publishBlockers.find((b) => b.field === field)?.message;
  const [showBlockers, setShowBlockers] = useState(false);

  const attemptPublish = () => {
    if (publishBlockers.length > 0) {
      setShowBlockers(true);
      const first = document.getElementById(
        publishBlockers[0].field === "media" ? "media-section" : publishBlockers[0].field,
      );
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error(publishBlockers[0].message);
      return;
    }
    createMutation.mutate("published");
  };

  const FieldError = ({ field }: { field: string }) => {
    const message = blockerFor(field);
    if (!message || !showBlockers) return null;
    return (
      <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{message}</span>
      </p>
    );
  };

  const visibilityOptions = [
    { value: "public", label: "Public", description: "Visible on your storefront", icon: Globe, color: "text-primary" },
    { value: "buyer_specific", label: "Buyer Specific", description: "Only visible to selected buyers", icon: Users, color: "text-warning" },
    { value: "private_draft", label: "Private Draft", description: "Only you can see it", icon: Lock, color: "text-muted-foreground" },
  ];

  return (
    <SidebarProvider>
      {/* Document-level scroll (no inner overflow container) so mobile browser
          chrome auto-hides and the bottom action bar is never trapped under the
          fixed tab bar. dvh, not vh: iOS clips the bottom of vh. */}
      <div className="flex min-h-[100dvh] w-full bg-background">
        <SellerStorefrontSidebar
          sellerName={dashData?.seller?.full_name || "Seller"}
          avatarUrl={dashData?.seller?.avatar_url || null}
          identityVerified={!!dashData?.seller?.identity_verified}
        />

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 border-b border-border bg-background px-3 py-3 sm:px-6 sm:py-4 lg:px-6">
            <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => navigate("/seller/storefront")}
                  aria-label="Back to storefront"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
                <div className="min-w-0">
                  <h1 className="text-base font-bold text-foreground sm:text-xl">Add Product</h1>
                  <p className="hidden text-sm text-muted-foreground sm:block">Create a new product listing for your public store</p>
                </div>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <Button
                  variant="outline"
                  onClick={() => createMutation.mutate("draft")}
                  disabled={createMutation.isPending}
                  className="min-h-11 gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Draft
                </Button>
                <Button
                  onClick={attemptPublish}
                  disabled={createMutation.isPending}
                  className="min-h-11 gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Publish
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto max-w-[1200px] space-y-4 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8">
            {/* Product Details */}
            <div className="rounded-2xl border border-border shadow-sm bg-card">
              <div className="flex items-center gap-3 border-b border-border p-4 sm:p-6">
                <Info className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Product Details</h2>
                  <p className="text-sm text-muted-foreground">Basic information about your product</p>
                </div>
              </div>
              <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Product Title *</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. iPhone 15 Pro Max 256GB" className="mt-1.5" />
                    <FieldError field="title" />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={categoryId || ""} onValueChange={(v) => setCategoryId(v || null)}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {(categories || []).map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="short_desc">Short Description</Label>
                  <Input id="short_desc" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="Brief one-liner" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="desc">Full Description *</Label>
                  <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed product description..." rows={5} className="mt-1.5" />
                    <FieldError field="desc" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Condition</Label>
                    <Select value={conditionLabel} onValueChange={setConditionLabel}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brand_new">Brand New</SelectItem>
                        <SelectItem value="like_new">Like New</SelectItem>
                        <SelectItem value="used_good">Used - Good</SelectItem>
                        <SelectItem value="used_fair">Used - Fair</SelectItem>
                        <SelectItem value="refurbished">Refurbished</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="model">Model / SKU</Label>
                    <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. A2849" className="mt-1.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Product Media */}
            <div id="media-section" className="scroll-mt-24 rounded-2xl border border-border shadow-sm bg-card">
              <div className="flex items-center gap-3 border-b border-border p-4 sm:p-6">
                <ImageIcon className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Product Media</h2>
                  <p className="text-sm text-muted-foreground">Upload high-quality images and videos</p>
                </div>
              </div>
              <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
                <MediaRequirementsPanel config={mediaConfig} />
                <FieldError field="media" />
                <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 px-3 py-8 transition-colors hover:border-primary/40 sm:py-12">
                  <CloudUpload className="h-10 w-10 text-muted-foreground" aria-hidden />
                  <div className="text-center">
                    <p className="font-medium text-foreground">Upload Product Images</p>
                    <p className="text-sm text-muted-foreground">Drag and drop or click to browse your files</p>
                  </div>
                  <span className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 mt-1 pointer-events-none">
                    Choose Files
                  </span>
                  <p className="text-center text-xs text-muted-foreground">
                    Up to {effectiveMaxImages} images + {mediaConfig.productMaxVideos} video ·
                    {" "}{mediaConfig.imageAllowedFormats.map((f) => f.toUpperCase()).join(", ")},
                    {" "}{mediaConfig.videoAllowedFormats.map((f) => f.toUpperCase()).join("/")}
                  </p>
                  {planPhotoSlots !== null && effectiveMaxImages < mediaConfig.productMaxImages && (
                    <p className="text-center text-xs font-medium text-muted-foreground">
                      Your plan includes {effectiveMaxImages} photo slots.
                    </p>
                  )}
                  <input type="file" className="hidden" accept={acceptAttr} multiple onChange={handleFileUpload} disabled={uploading} />
                </label>

                {files.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {files.map((f, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg border overflow-hidden group">
                        {f.media_type === "video" ? (
                          <video src={f.localPreview || f.preview_url} className="w-full h-full object-cover"></video>
                        ) : (
                          <img src={f.localPreview || f.preview_url} alt={f.name} className="w-full h-full object-cover" />
                        )}
                        {f.status === "uploading" && (
                          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
                            <Progress value={f.progress} className="w-3/4 h-1.5" />
                            <span className="text-primary-foreground text-xs font-medium">{f.progress}%</span>
                          </div>
                        )}
                        {f.status === "error" && (
                          <div className="absolute inset-0 bg-destructive/60 flex flex-col items-center justify-center gap-2">
                            <AlertCircle className="h-5 w-5 text-primary-foreground" />
                            <span className="text-primary-foreground text-xs">Failed</span>
                            <button onClick={() => retryUpload(idx)} className="flex items-center gap-1 bg-background/20 text-primary-foreground text-xs px-2 py-1 rounded hover:bg-background/30 min-h-11">
                              <RotateCcw className="h-3 w-3" /> Retry
                            </button>
                          </div>
                        )}
                        {/* Always visible and 44px on touch: hover-reveal made
                            photo removal impossible on a phone. */}
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          aria-label={`Remove ${f.name}`}
                           className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                        {idx === 0 && f.status === "done" && (
                          <span className="absolute bottom-1 left-1 bg-success text-primary-foreground text-[12px] px-1.5 py-0.5 rounded-full font-medium">Primary</span>
                        )}
                      </div>
                    ))}
                    {(() => {
                      const imgCount = files.filter((f) => f.media_type === "image").length;
                      const vidCount = files.filter((f) => f.media_type === "video").length;
                       if (imgCount >= effectiveMaxImages && vidCount >= mediaConfig.productMaxVideos) return null;
                      return (
                        <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-colors min-h-11">
                          <ImagePlus className="h-6 w-6 text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">Add More</span>
                          <input type="file" className="hidden" accept={acceptAttr} multiple onChange={handleFileUpload} disabled={uploading} />
                        </label>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Pricing & Stock */}
            <div className="rounded-2xl border border-border shadow-sm bg-card">
              <div className="flex items-center gap-3 border-b border-border p-4 sm:p-6">
                <Banknote className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Pricing & Stock</h2>
                  <p className="text-sm text-muted-foreground">Set your price and manage inventory</p>
                </div>
              </div>
              <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Unit Price (₦) *</Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₦</span>
                      <Input id="price" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" className="pl-8" />
                    </div>
                    <FieldError field="price" />
                  </div>
                  <div>
                    <Label htmlFor="original-price">Original Price (₦) <span className="text-muted-foreground font-normal">— optional</span></Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₦</span>
                      <Input id="original-price" type="number" min="0" step="0.01" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="0.00" className="pl-8" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Show a crossed-out price to indicate a discount</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="stock">Stock Quantity</Label>
                    <Input id="stock" type="number" min="0" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} className="mt-1.5" />
                    <p className="text-xs text-muted-foreground mt-1">You'll be notified when stock runs low</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Agreement & Delivery */}
            <div className="rounded-2xl border border-border shadow-sm bg-card">
              <div className="flex items-center gap-3 border-b border-border p-4 sm:p-6">
                <Handshake className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Agreement & Delivery</h2>
                  <p className="text-sm text-muted-foreground">Transaction terms and delivery options</p>
                </div>
              </div>
              <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
                <div>
                  <Label htmlFor="notes">Seller Notes (private)</Label>
                  <Textarea id="notes" value={sellerNotes} onChange={(e) => setSellerNotes(e.target.value)} placeholder="Internal notes, not visible to buyers" rows={3} className="mt-1.5" />
                </div>

                {/* Feature Highlights */}
                <div>
                  <Label>Feature Highlights</Label>
                  <p className="text-xs text-muted-foreground mb-2">Add key features buyers will see on the product detail page.</p>
                  <div className="space-y-2">
                    {featureHighlights.map((fh, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Input
                          placeholder="Feature title"
                          value={fh.title}
                          onChange={(e) => {
                            const updated = [...featureHighlights];
                            updated[idx] = { ...updated[idx], title: e.target.value };
                            setFeatureHighlights(updated);
                          }}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Brief description"
                          value={fh.description}
                          onChange={(e) => {
                            const updated = [...featureHighlights];
                            updated[idx] = { ...updated[idx], description: e.target.value };
                            setFeatureHighlights(updated);
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => setFeatureHighlights(featureHighlights.filter((_, i) => i !== idx))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFeatureHighlights([...featureHighlights, { title: "", description: "" }])}
                    >
                      + Add Feature
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="delivery_scope">Delivery Scope</Label>
                    <Input id="delivery_scope" value={deliveryScope} onChange={(e) => setDeliveryScope(e.target.value)} placeholder="e.g. Lagos & Abuja" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="est_delivery">Estimated Delivery</Label>
                    <Input id="est_delivery" value={estimatedDeliveryDays} onChange={(e) => setEstimatedDeliveryDays(e.target.value)} placeholder="e.g. 1-3 business days" className="mt-1.5" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Delivery Methods</Label>
                    <p className="text-xs text-muted-foreground mb-2">Select all delivery methods your business supports.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {DELIVERY_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors min-h-11">
                          <Checkbox
                            checked={deliveryMethods.includes(opt.value)}
                            onCheckedChange={(checked) => {
                              setDeliveryMethods((prev) =>
                                checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value)
                              );
                            }}
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Verification Window</Label>
                    <Select value={verificationWindowHours} onValueChange={setVerificationWindowHours}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select duration" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24">24 hours</SelectItem>
                        <SelectItem value="48">48 hours</SelectItem>
                        <SelectItem value="72">72 hours</SelectItem>
                        <SelectItem value="168">1 week</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Hours the buyer has to verify the item after delivery</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visibility & Status */}
            <div className="rounded-2xl border border-border shadow-sm bg-card">
              <div className="flex items-center gap-3 border-b border-border p-4 sm:p-6">
                <Eye className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Visibility & Status</h2>
                  <p className="text-sm text-muted-foreground">Control who can see this product</p>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {visibilityOptions.map((opt) => {
                    const isSelected = visibilityType === opt.value;
                    const IconComp = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setVisibilityType(opt.value)}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                          isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                        }`}
                      >
                        <IconComp className={`h-5 w-5 mt-0.5 ${isSelected ? "text-primary" : opt.color}`} />
                        <div>
                          <p className="font-medium text-foreground">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Bar — stacks on narrow screens instead of forcing a
                no-wrap row that cannot fit 360px. */}
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">SafeDeal Protection</p>
                  <p className="text-xs text-muted-foreground">All transactions are protected by our escrow system</p>
                </div>
              </div>

              {showBlockers && publishBlockers.length > 0 && (
                <ul role="alert" className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  {publishBlockers.map((b) => (
                    <li key={b.field} className="flex items-start gap-2 text-xs font-medium text-destructive">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>{b.message}</span>
                    </li>
                  ))}
                  <li className="pl-5 text-xs text-muted-foreground">You can still save this as a draft.</li>
                </ul>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <Button
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => createMutation.mutate("draft")}
                  disabled={createMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" aria-hidden />
                  Save Draft
                </Button>
                <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => navigate("/seller/storefront")}>
                  Cancel
                </Button>
                <Button
                  onClick={attemptPublish}
                  disabled={createMutation.isPending}
                  className="min-h-11 w-full gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground sm:w-auto"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Create Product
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ProductPhotoCropDialog
        photo={cropQueue[0] ?? null}
        onConfirm={handleCropConfirm}
        onSkip={dequeueCrop}
      />
    </SidebarProvider>
  );
};

export default SellerProductCreate;
