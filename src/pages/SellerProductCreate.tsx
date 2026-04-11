import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [stockQuantity, setStockQuantity] = useState("1");
  const [agreementTerms, setAgreementTerms] = useState("");
  const [deliveryMethods, setDeliveryMethods] = useState<string[]>([]);
  const [verificationWindowHours, setVerificationWindowHours] = useState("");
  const [sellerNotes, setSellerNotes] = useState("");
  const [visibilityType, setVisibilityType] = useState("public");
  const [files, setFiles] = useState<FileEntry[]>([]);

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
        stock_quantity: parseInt(stockQuantity) || 0,
        agreement_terms: agreementTerms || undefined,
        delivery_methods: deliveryMethods.length > 0 ? deliveryMethods : undefined,
        verification_window_hours: verificationWindowHours
          ? parseInt(verificationWindowHours)
          : undefined,
        seller_notes: sellerNotes || undefined,
        visibility_type: visibilityType,
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
    e.target.value = "";

    const newEntries: FileEntry[] = fileArray.map((file) => ({
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
    let activeUploads = fileArray.length;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const tempId = newEntries[i].file_id;
      uploadProductFile(file, (pct) => {
        setFiles((prev) => prev.map((f) => (f.file_id === tempId ? { ...f, progress: pct } : f)));
      })
        .then((result) => {
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

  const canPublish = title.trim().length >= 2 && description.trim().length >= 10 && !!unitPrice && parseFloat(unitPrice) > 0;

  const visibilityOptions = [
    { value: "public", label: "Public", description: "Visible on your storefront", icon: Globe, color: "text-primary" },
    { value: "buyer_specific", label: "Buyer Specific", description: "Only visible to selected buyers", icon: Users, color: "text-warning" },
    { value: "private_draft", label: "Private Draft", description: "Only you can see it", icon: Lock, color: "text-muted-foreground" },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <SellerStorefrontSidebar
          sellerName={dashData?.seller?.full_name || "Seller"}
          avatarUrl={dashData?.seller?.avatar_url || null}
          verificationLevel={(dashData?.seller as any)?.verification_level || "unverified"}
        />

        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
            <div className="max-w-[1200px] mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate("/seller/storefront")}
                  className="flex items-center justify-center w-10 h-10 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-foreground">Add Product</h1>
                  <p className="text-sm text-muted-foreground">Create a new product listing for your public store</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => createMutation.mutate("draft")}
                  disabled={createMutation.isPending}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Draft
                </Button>
                <Button
                  onClick={() => createMutation.mutate("published")}
                  disabled={createMutation.isPending || !canPublish}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Publish
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
            {/* Product Details */}
            <div className="rounded-2xl border border-border shadow-sm bg-card">
              <div className="p-6 border-b border-border flex items-center gap-3">
                <Info className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Product Details</h2>
                  <p className="text-sm text-muted-foreground">Basic information about your product</p>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Product Title *</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. iPhone 15 Pro Max 256GB" className="mt-1.5" />
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
            <div className="rounded-2xl border border-border shadow-sm bg-card">
              <div className="p-6 border-b border-border flex items-center gap-3">
                <ImageIcon className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Product Media</h2>
                  <p className="text-sm text-muted-foreground">Upload high-quality images and videos</p>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <label className="flex flex-col items-center justify-center gap-3 py-12 rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 cursor-pointer transition-colors bg-muted/30">
                  <CloudUpload className="h-10 w-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium text-foreground">Upload Product Images</p>
                    <p className="text-sm text-muted-foreground">Drag and drop or click to browse your files</p>
                  </div>
                  <Button type="button" size="sm" className="mt-1" onClick={(e) => e.preventDefault()}>
                    Choose Files
                  </Button>
                  <p className="text-xs text-muted-foreground">PNG, JPG, MP4 up to 10MB each</p>
                  <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} disabled={uploading} />
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
                            <button onClick={() => retryUpload(idx)} className="flex items-center gap-1 bg-background/20 text-primary-foreground text-xs px-2 py-1 rounded hover:bg-background/30">
                              <RotateCcw className="h-3 w-3" /> Retry
                            </button>
                          </div>
                        )}
                        <button onClick={() => removeFile(idx)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-3 w-3" />
                        </button>
                        {idx === 0 && f.status === "done" && (
                          <span className="absolute bottom-1 left-1 bg-success text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium">Primary</span>
                        )}
                      </div>
                    ))}
                    <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-colors">
                      <ImagePlus className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Add More</span>
                      <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} disabled={uploading} />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing & Stock */}
            <div className="rounded-2xl border border-border shadow-sm bg-card">
              <div className="p-6 border-b border-border flex items-center gap-3">
                <Banknote className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Pricing & Stock</h2>
                  <p className="text-sm text-muted-foreground">Set your price and manage inventory</p>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Unit Price (₦) *</Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₦</span>
                      <Input id="price" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" className="pl-8" />
                    </div>
                  </div>
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
              <div className="p-6 border-b border-border flex items-center gap-3">
                <Handshake className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Agreement & Delivery</h2>
                  <p className="text-sm text-muted-foreground">Transaction terms and delivery options</p>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <Label htmlFor="notes">Seller Notes (private)</Label>
                  <Textarea id="notes" value={sellerNotes} onChange={(e) => setSellerNotes(e.target.value)} placeholder="Internal notes, not visible to buyers" rows={3} className="mt-1.5" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Delivery Methods</Label>
                    <p className="text-xs text-muted-foreground mb-2">Select all delivery methods your business supports.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {DELIVERY_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors">
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
              <div className="p-6 border-b border-border flex items-center gap-3">
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

            {/* Bottom Bar */}
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium text-foreground">SafeDeal Protection</p>
                  <p className="text-xs text-muted-foreground">All transactions are protected by our escrow system</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => navigate("/seller/storefront")}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate("published")}
                  disabled={createMutation.isPending || !canPublish}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Create Product
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SellerProductCreate;
