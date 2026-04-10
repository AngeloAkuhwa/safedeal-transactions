import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Save, Upload, Loader2, ImagePlus, X, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { toast } from "@/components/ui/sonner";
import { createProduct, getProductCategories } from "@/services/seller-storefront.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { uploadProductFile } from "@/services/create-transaction.service";

const STEPS = ["Product Details", "Media", "Pricing & Stock", "Delivery & Settings"];

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
  const [step, setStep] = useState(0);
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
  const [deliveryMethod, setDeliveryMethod] = useState("");
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
        delivery_method: deliveryMethod || undefined,
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

    // Create placeholder entries with local previews
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
        setFiles((prev) =>
          prev.map((f) => (f.file_id === tempId ? { ...f, progress: pct } : f))
        );
      })
        .then((result) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.file_id === tempId
                ? {
                    ...f,
                    file_id: result.file_id,
                    preview_url: result.secure_url,
                    status: "done" as const,
                    progress: 100,
                    originalFile: undefined,
                  }
                : f
            )
          );
        })
        .catch((err) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.file_id === tempId ? { ...f, status: "error" as const, progress: 0 } : f
            )
          );
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

    setFiles((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, status: "uploading" as const, progress: 0 } : f))
    );
    setUploading(true);

    try {
      const result = await uploadProductFile(file, (pct) => {
        setFiles((prev) =>
          prev.map((f) => (f.file_id === tempId ? { ...f, progress: pct } : f))
        );
      });
      setFiles((prev) =>
        prev.map((f) =>
          f.file_id === tempId
            ? { ...f, file_id: result.file_id, preview_url: result.secure_url, status: "done" as const, progress: 100, originalFile: undefined }
            : f
        )
      );
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f) => (f.file_id === tempId ? { ...f, status: "error" as const, progress: 0 } : f))
      );
      toast.error(`Retry failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const canNext = () => {
    if (step === 0) return title.trim().length >= 2 && description.trim().length >= 10;
    if (step === 2) return !!unitPrice && parseFloat(unitPrice) > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav
        sellerName={dashData?.seller?.full_name || "Seller"}
        avatarUrl={dashData?.seller?.avatar_url || null}
      />

      <div className="bg-gradient-to-br from-sky-50 via-background to-green-50 dark:from-sky-950/20 dark:via-background dark:to-green-950/20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
          <Button
            variant="ghost"
            className="mb-4 gap-2 text-muted-foreground"
            onClick={() => navigate("/seller/storefront")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Storefront
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Add New Product</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>

          {/* Progress */}
          <div className="flex gap-2 mt-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-success" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle>{STEPS[step]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 0 && (
                <>
                  <div>
                    <Label htmlFor="title">Product Title *</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. iPhone 15 Pro Max 256GB" />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={categoryId || ""} onValueChange={(v) => setCategoryId(v || null)}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {(categories || []).map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="short_desc">Short Description</Label>
                    <Input id="short_desc" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="Brief one-liner" />
                  </div>
                  <div>
                    <Label htmlFor="desc">Full Description *</Label>
                    <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed product description..." rows={5} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Condition</Label>
                      <Select value={conditionLabel} onValueChange={setConditionLabel}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
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
                      <Label htmlFor="sku">SKU</Label>
                      <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="brand">Brand</Label>
                      <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple" />
                    </div>
                    <div>
                      <Label htmlFor="model">Model</Label>
                      <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. A2849" />
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Upload product images and videos. The first image will be used as the primary display image.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {files.map((f, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg border overflow-hidden group">
                        {f.media_type === "video" ? (
                          <video src={f.localPreview || f.preview_url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={f.localPreview || f.preview_url} alt={f.name} className="w-full h-full object-cover" />
                        )}
                        {/* Upload progress overlay */}
                        {f.status === "uploading" && (
                          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin text-white" />
                            <Progress value={f.progress} className="w-3/4 h-1.5" />
                            <span className="text-white text-xs font-medium">{f.progress}%</span>
                          </div>
                        )}
                        {/* Error overlay */}
                        {f.status === "error" && (
                          <div className="absolute inset-0 bg-destructive/60 flex flex-col items-center justify-center gap-2">
                            <AlertCircle className="h-5 w-5 text-white" />
                            <span className="text-white text-xs">Failed</span>
                            <button
                              onClick={() => retryUpload(idx)}
                              className="flex items-center gap-1 bg-white/20 text-white text-xs px-2 py-1 rounded hover:bg-white/30"
                            >
                              <RotateCcw className="h-3 w-3" /> Retry
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(idx)}
                          className="absolute top-1 right-1 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {idx === 0 && f.status === "done" && (
                          <span className="absolute bottom-1 left-1 bg-success text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                            Primary
                          </span>
                        )}
                      </div>
                    ))}
                    <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-colors">
                      <ImagePlus className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Add Media</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,video/*"
                        multiple
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price">Price (₦) *</Label>
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="stock">Stock Quantity</Label>
                      <Input
                        id="stock"
                        type="number"
                        min="0"
                        value={stockQuantity}
                        onChange={(e) => setStockQuantity(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="terms">Agreement Terms</Label>
                    <Textarea
                      id="terms"
                      value={agreementTerms}
                      onChange={(e) => setAgreementTerms(e.target.value)}
                      placeholder="Terms the buyer will see before purchasing..."
                      rows={4}
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <Label>Delivery Method</Label>
                    <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                      <SelectTrigger><SelectValue placeholder="Select delivery method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pickup">Pickup</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="shipping">Shipping</SelectItem>
                        <SelectItem value="digital">Digital / Instant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="window">Verification Window (hours)</Label>
                    <Input
                      id="window"
                      type="number"
                      min="1"
                      value={verificationWindowHours}
                      onChange={(e) => setVerificationWindowHours(e.target.value)}
                      placeholder="e.g. 48"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Hours the buyer has to verify the item after delivery
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="notes">Seller Notes (private)</Label>
                    <Textarea
                      id="notes"
                      value={sellerNotes}
                      onChange={(e) => setSellerNotes(e.target.value)}
                      placeholder="Internal notes, not visible to buyers"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Visibility</Label>
                    <Select value={visibilityType} onValueChange={setVisibilityType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public – visible on your storefront</SelectItem>
                        <SelectItem value="private_draft">Private – only you can see it</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>

            <div className="flex gap-3">
              {step === STEPS.length - 1 ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => createMutation.mutate("draft")}
                    disabled={createMutation.isPending}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    Save as Draft
                  </Button>
                  <Button
                    onClick={() => createMutation.mutate("published")}
                    disabled={createMutation.isPending || !canNext()}
                    className="bg-success hover:bg-success/90 text-white gap-2"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Publish Product
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNext()}
                  className="gap-2"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SellerProductCreate;
