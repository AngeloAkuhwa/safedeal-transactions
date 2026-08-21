// SellerProductDetail page
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Save, Archive, Eye, EyeOff, ExternalLink,
  Globe, Users, Lock, Share2, ShieldCheck,
  Info, ImageIcon, Banknote, Handshake, PackagePlus,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/common/BackLink";
import { ManageVisibilityModal } from "@/components/storefront/ManageVisibilityModal";
import { PublishSuccessModal } from "@/components/storefront/PublishSuccessModal";
import { RestockModal } from "@/components/seller/RestockModal";
import { InventoryLogTable } from "@/components/seller/InventoryLogTable";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { formatMoney } from "@/lib/format";
import { ProductStatusBadge } from "@/components/storefront/ProductStatusBadge";
import { SellerStorefrontSidebar } from "@/components/storefront/SellerStorefrontSidebar";
import {
  getSellerProductDetail,
  updateProduct,
  archiveProduct,
  getProductCategories,
} from "@/services/seller-storefront.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function relativeTime(dateStr?: string) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const SellerProductDetail = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [conditionLabel, setConditionLabel] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [agreementTerms, setAgreementTerms] = useState("");
  const [deliveryMethods, setDeliveryMethods] = useState<string[]>([]);
  const [sellerNotes, setSellerNotes] = useState("");
  const [visibilityType, setVisibilityType] = useState("public");
  const [brand, setBrand] = useState("");
  const [modelSku, setModelSku] = useState("");
  const [verificationWindow, setVerificationWindow] = useState("48");
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [publishSuccessOpen, setPublishSuccessOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["seller-product-detail", productId],
    queryFn: () => getSellerProductDetail(productId!),
    enabled: !!productId,
  });

  useEffect(() => {
    if (data?.product) {
      const p = data.product;
      setTitle(p.title || "");
      setCategoryId(p.category_id || null);
      setShortDescription(p.short_description || "");
      setDescription(p.description || "");
      setConditionLabel(p.condition_label || "");
      setUnitPrice(String(p.unit_price || ""));
      setStockQuantity(String(p.stock_quantity || 0));
      setAgreementTerms(p.agreement_terms || "");
      let methods: string[] = [];
      try {
        const parsed = JSON.parse(p.delivery_method || "[]");
        methods = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        methods = p.delivery_method ? [p.delivery_method] : [];
      }
      setDeliveryMethods(methods);
      setSellerNotes(p.seller_notes || "");
      setVisibilityType(p.visibility_type || "public");
      setBrand(p.brand || "");
      setModelSku(p.sku || p.model || "");
      // Empty when unset: the seller picks a window rather than inheriting an
      // invented one silently saved back on the next update.
      setVerificationWindow(p.verification_window_hours ? String(p.verification_window_hours) : "");
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => updateProduct(productId!, payload),
    onSuccess: () => {
      toast.success("Product updated");
      queryClient.invalidateQueries({ queryKey: ["seller-product-detail", productId] });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveProduct(productId!),
    onSuccess: () => {
      toast.success("Product archived");
      navigate("/seller/storefront");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    updateMutation.mutate({
      title,
      category_id: categoryId,
      short_description: shortDescription,
      description,
      condition_label: conditionLabel,
      unit_price: parseFloat(unitPrice),
      agreement_terms: agreementTerms,
      delivery_methods: deliveryMethods,
      seller_notes: sellerNotes,
      visibility_type: visibilityType,
      brand,
      model: modelSku,
      verification_window_hours: verificationWindow ? parseInt(verificationWindow) : null,
    });
  };

  const handleStatusToggle = () => {
    const currentStatus = data?.product?.status;
    if (currentStatus === "published") {
      // Unpublish goes through modal
      setVisibilityModalOpen(true);
      return;
    }
    // Publishing draft → published
    updateMutation.mutate({ status: "published" }, {
      onSuccess: () => {
        setPublishSuccessOpen(true);
        queryClient.invalidateQueries({ queryKey: ["seller-product-detail", productId] });
        queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      },
    });
  };

  const sellerName = dashData?.seller?.full_name || "Seller";
  const avatarUrl = dashData?.seller?.avatar_url || null;
  const identityVerified = !!dashData?.seller?.identity_verified;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background px-3 py-4 sm:px-6">
        <Skeleton className="h-10 w-48" />
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
          <div className="space-y-4 xl:col-span-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !data?.product) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4">
        <h2 className="text-xl font-bold text-foreground">Product not found</h2>
        <Button onClick={() => navigate("/seller/storefront")}>Back to Storefront</Button>
      </div>
    );
  }

  const product = data.product;
  const isPrivateOffer = product.visibility_type === "buyer_specific";
  const reservedQty = Number(product.reserved_quantity ?? 0);
  const availableQty = Math.max(0, Number(product.stock_quantity ?? 0) - reservedQty);
  const isOutOfStock = availableQty === 0;
  const isLowStock = availableQty >= 1 && availableQty <= 5;

  const stockColor = isOutOfStock ? "text-destructive" : isLowStock ? "text-amber-500" : "text-emerald-500";

  const visibilityOptions = [
    { value: "public", label: "Public", description: "Visible to everyone on your storefront", icon: Globe, color: "text-blue-500" },
    { value: "buyer_specific", label: "Buyer Specific", description: "Only visible to specific buyers you share with", icon: Users, color: "text-amber-500" },
    { value: "private_draft", label: "Private Draft", description: "Hidden from all buyers, only you can see", icon: Lock, color: "text-muted-foreground" },
  ];

  // Read-only guard for private-offer products
  if (isPrivateOffer) {
    return (
      <div className="flex min-h-[100dvh] bg-background">
        <SellerStorefrontSidebar sellerName={sellerName} avatarUrl={avatarUrl} identityVerified={identityVerified} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-6 lg:px-8 lg:py-4">
            <BackLink to="/seller/storefront" label="Back to storefront" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-bold text-foreground sm:text-xl">{product.title}</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Private
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Private offer product · read-only</p>
            </div>
          </div>
          <div className="max-w-3xl flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:mb-6 sm:p-6">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold text-foreground mb-1">This is a private offer product</h2>
                  <p className="text-sm text-muted-foreground">
                    Manage it from your <strong>Private Offers</strong> list. Price, quantity, and agreement terms are locked once published. To change anything, cancel and recreate the offer.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Snapshot</h3>
              <p className="text-2xl font-bold text-foreground">{product.title}</p>
              {product.short_description && <p className="text-sm text-muted-foreground">{product.short_description}</p>}
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-lg font-semibold text-foreground">{formatMoney(Number(product.unit_price), product.currency_code)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Stock</p>
                  <p className={`text-lg font-semibold ${stockColor}`}>{availableQty}</p>
                  {reservedQty > 0 && (
                    <p className="text-xs text-muted-foreground">
                      of {product.stock_quantity} ({reservedQty} reserved)
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <SellerStorefrontSidebar
        sellerName={sellerName}
        avatarUrl={avatarUrl}
        identityVerified={identityVerified}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="sticky top-0 z-sticky flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur sm:px-6 lg:px-8 lg:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <BackLink to="/seller/storefront" label="Back to storefront" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-foreground sm:text-xl">Edit Product</h1>
                <ProductStatusBadge status={product.status} />
              </div>
              <p className="hidden text-sm text-muted-foreground sm:block">Update listing details, stock, pricing, and visibility</p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibilityModalOpen(true)}
              disabled={archiveMutation.isPending}
              className="gap-1.5 text-destructive hover:text-destructive hidden sm:flex"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive Product
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStatusToggle}
              disabled={updateMutation.isPending}
              className="min-h-11 flex-1 gap-1.5 sm:min-h-0 sm:flex-none"
            >
              {product.status === "published" ? (
                <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
              ) : (
                <><Eye className="h-3.5 w-3.5" /> Publish</>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="min-h-11 flex-1 gap-1.5 border-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 sm:min-h-0 sm:flex-none"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Changes
            </Button>
          </div>
        </div>

        {/* Content: document scroll, no nested scroller */}
        <div className="relative z-rail flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="grid max-w-7xl grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-4">
            {/* Main content: col-span-3 */}
            <div className="xl:col-span-3 space-y-6">
              {/* Product Details */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Product Details</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Basic information about your product</p>
                </div>
                <div className="space-y-4 p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-foreground">Product Title</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5 px-4 py-3 rounded-lg" placeholder="Enter product title" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-foreground">Category</Label>
                      <Select value={categoryId || ""} onValueChange={(v) => setCategoryId(v || null)}>
                        <SelectTrigger className="mt-1.5 px-4 py-3 rounded-lg h-auto"><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {(categories || []).map((cat: any) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Short Description</Label>
                    <Input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} className="mt-1.5 px-4 py-3 rounded-lg" placeholder="Brief summary of your product" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Full Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="mt-1.5 px-4 py-3 rounded-lg" placeholder="Detailed product description..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-foreground">Condition</Label>
                      <Select value={conditionLabel} onValueChange={setConditionLabel}>
                        <SelectTrigger className="mt-1.5 px-4 py-3 rounded-lg h-auto"><SelectValue placeholder="Select" /></SelectTrigger>
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
                      <Label className="text-sm font-medium text-foreground">Brand</Label>
                      <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-1.5 px-4 py-3 rounded-lg" placeholder="e.g. Samsung" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-foreground">Model / SKU</Label>
                      <Input value={modelSku} onChange={(e) => setModelSku(e.target.value)} className="mt-1.5 px-4 py-3 rounded-lg" placeholder="e.g. Galaxy S24" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Media */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Product Media</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Upload high-quality images and videos</p>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                      {(product.media || []).map((m: any, idx: number) => (
                        <div key={m.id} className="relative group aspect-square rounded-xl border border-border overflow-hidden bg-muted">
                          {m.media_type === "video" && (
                            <video src={m.file_url} className="w-full h-full object-cover"></video>
                          )}
                          {m.media_type !== "video" && (
                            <img src={m.file_url} alt={title} className="w-full h-full object-cover" />
                          )}
                          {idx === 0 && (
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-primary text-primary-foreground text-xs font-semibold rounded">
                              Primary
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Upload placeholder */}
                      <div className="aspect-square rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                        <span className="text-2xl text-muted-foreground">+</span>
                      </div>
                    </div>
                  </div>
                </div>
              {/* Pricing & Stock */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-primary" />
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Pricing & Stock</h2>
                      <p className="text-sm text-muted-foreground mt-1">Set your price and manage inventory</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRestockOpen(true)}
                    className="gap-1.5"
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                    Restock
                  </Button>
                </div>
                <div className="space-y-4 p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-foreground">Unit Price</Label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₦</span>
                        <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="pl-8 px-4 py-3 rounded-lg" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-foreground">Stock Quantity</Label>
                      <Input
                        type="number"
                        value={stockQuantity}
                        readOnly
                        disabled
                        className="mt-1.5 px-4 py-3 rounded-lg bg-muted/50 cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
                        Reserved: <span className="font-semibold text-amber-500">{product.reserved_quantity || 0}</span>
                        <span>·</span>
                        Available: <span className="font-semibold text-emerald-500">{Math.max(0, (product.stock_quantity || 0) - (product.reserved_quantity || 0))}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="Explain available stock" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs">?</span></button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">Available stock excludes units reserved by in-flight checkouts.</TooltipContent>
                        </Tooltip>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use the <span className="font-semibold">Restock</span> button above to add inventory. Every change is logged below.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Manual stock edits are logged in the inventory history below.</p>
                </div>
              </div>

              {/* Inventory History */}
              <InventoryLogTable productId={productId!} />

              {/* Agreement & Delivery */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Handshake className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Agreement & Delivery</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Transaction terms and delivery options</p>
                </div>
                <div className="space-y-4 p-4 sm:p-6">
                  <div>
                    <Label className="text-sm font-medium text-foreground">Seller Notes</Label>
                    <Textarea value={sellerNotes} onChange={(e) => setSellerNotes(e.target.value)} rows={3} className="mt-1.5 px-4 py-3 rounded-lg" placeholder="Private notes about this product..." />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-foreground mb-2 block">Supported Delivery Methods</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { value: "pickup", label: "Pickup" },
                        { value: "delivery", label: "Delivery" },
                        { value: "courier_shipping", label: "Courier / Shipping" },
                        { value: "digital", label: "Digital / Instant" },
                        { value: "hand_delivery", label: "Hand Delivery" },
                        { value: "meetup", label: "Meetup" },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            checked={deliveryMethods.includes(opt.value)}
                            onCheckedChange={(checked) => {
                              setDeliveryMethods((prev) =>
                                checked
                                  ? [...prev, opt.value]
                                  : prev.filter((v) => v !== opt.value)
                              );
                            }}
                          />
                          <span className="text-sm text-foreground">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-foreground">Verification Window</Label>
                      <Select value={verificationWindow} onValueChange={setVerificationWindow}>
                        <SelectTrigger className="mt-1.5 px-4 py-3 rounded-lg h-auto"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24">24 hours</SelectItem>
                          <SelectItem value="48">48 hours</SelectItem>
                          <SelectItem value="72">72 hours</SelectItem>
                          <SelectItem value="168">1 week</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-foreground">Agreement Terms</Label>
                      <Textarea value={agreementTerms} onChange={(e) => setAgreementTerms(e.target.value)} rows={2} className="mt-1.5 px-4 py-3 rounded-lg" placeholder="Terms for this product..." />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Buyers will have this window to verify the product before funds are released</p>
                </div>
              </div>

              {/* Visibility & Status */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Visibility & Status</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Control who can see this product</p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {visibilityOptions.map((opt) => {
                      const isSelected = visibilityType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setVisibilityType(opt.value)}
                          className={`text-left p-4 rounded-xl border-2 transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/30 hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <opt.icon className={`h-5 w-5 ${isSelected ? "text-primary" : opt.color}`} />
                            <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right sidebar: col-span-1 */}
            <div className="xl:col-span-1 space-y-6">
              {/* Product Status */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <h3 className="text-base font-semibold text-foreground">Product Status</h3>
                </div>
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <ProductStatusBadge status={product.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Stock</span>
                    <span className={`text-xs font-semibold ${stockColor}`}>
                      {availableQty} available
                      {reservedQty > 0 ? ` · ${reservedQty} reserved` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Views</span>
                    <span className="text-xs text-foreground">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Last Updated</span>
                    <span className="text-xs text-foreground">{relativeTime(product.updated_at)}</span>
                  </div>
                  <div className="pt-3 border-t border-border space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 justify-center"
                      onClick={() => navigate(`/seller/storefront/${productId}/preview`)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview Product
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full gap-1.5 justify-center bg-primary/5 border border-primary/20 text-primary hover:bg-primary/10" asChild>
                      <a href={product.store_slug ? `/store/${product.store_slug}` : "#"} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        View on Storefront
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <h3 className="text-base font-semibold text-foreground">Quick Actions</h3>
                </div>
                <div className="p-6 space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2 text-foreground"
                    disabled={!product.store_slug}
                    onClick={async () => {
                      if (!product.store_slug) return;
                      const url = `${window.location.origin}/store/${product.store_slug}`;
                      await navigator.clipboard.writeText(url);
                      toast.success("Storefront link copied");
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {product.store_slug ? "Copy storefront link" : "Publish your store to share"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setVisibilityModalOpen(true)}
                    disabled={archiveMutation.isPending}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive Product
                  </Button>
                </div>
              </div>

              {/* SafeDeal Protection */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <h3 className="text-base font-semibold text-foreground">SafeDeal Protection</h3>
                </div>
                <div className="p-6">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      All transactions through your storefront are protected by SafeDeal escrow. Funds are held securely until buyers verify their purchase.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ManageVisibilityModal
        open={visibilityModalOpen}
        onOpenChange={setVisibilityModalOpen}
        product={product ? {
          id: product.id,
          title: product.title,
          category_name: product.category?.name || null,
          unit_price: product.unit_price,
          currency_code: product.currency_code || "NGN",
          status: product.status,
          visibility_type: product.visibility_type,
          primary_image_url: product.media?.[0]?.file_url || null,
        } : null}
        onUnpublish={(pid) => {
          updateMutation.mutate({ status: "draft" }, {
            onSuccess: () => setVisibilityModalOpen(false),
          });
        }}
        onArchive={(pid) => {
          archiveMutation.mutate(undefined, {
            onSuccess: () => setVisibilityModalOpen(false),
          });
        }}
        isPending={updateMutation.isPending || archiveMutation.isPending}
      />
      <PublishSuccessModal
        open={publishSuccessOpen}
        onOpenChange={setPublishSuccessOpen}
        product={product ? {
          title: product.title,
          category_name: product.category?.name || null,
          unit_price: product.unit_price,
          currency_code: product.currency_code || "NGN",
          primary_image_url: product.media?.[0]?.file_url || null,
          slug: product.slug || "",
        } : null}
        storeSlug={product?.store_slug || dashData?.seller?.store_slug || null}
        onPreview={() => {
          setPublishSuccessOpen(false);
          navigate(`/seller/storefront/${productId}/preview`);
        }}
        onViewStore={() => {
          setPublishSuccessOpen(false);
          const slug = product?.store_slug || dashData?.seller?.store_slug;
          if (slug) navigate(`/store/${slug}`);
        }}
        onBackToStorefront={() => {
          setPublishSuccessOpen(false);
          navigate("/seller/storefront");
        }}
      />
      <RestockModal
        open={restockOpen}
        onOpenChange={setRestockOpen}
        productId={productId!}
        productTitle={product.title}
        currentStock={product.stock_quantity || 0}
        currentReserved={product.reserved_quantity || 0}
      />
    </div>
  );
};

export default SellerProductDetail;
  
