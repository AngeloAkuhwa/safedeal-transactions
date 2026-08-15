import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Eye, ExternalLink, Pencil,
  Globe, Users, Lock, Copy, Share2, ShieldCheck, Archive,
  ImageIcon, AlignLeft, FileText, UserCheck, EyeOff,
  Clock, Bookmark, BarChart3, Package, CheckCircle2, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ProductStatusBadge } from "@/components/storefront/ProductStatusBadge";
import { alwaysClaim } from "@/lib/trust/trust-claims";
import { sellerVerificationClaim } from "@/lib/trust/trust-claims";
import { SellerStorefrontSidebar } from "@/components/storefront/SellerStorefrontSidebar";
import { ManageVisibilityModal } from "@/components/storefront/ManageVisibilityModal";
import { getSellerProductDetail, updateProduct, archiveProduct } from "@/services/seller-storefront.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { formatMoney } from "@/lib/format";

const formatPrice = (amount: number) => formatMoney(amount, "NGN");

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

function formatCondition(label?: string) {
  if (!label) return "—";
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseDeliveryMethods(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return raw ? [raw] : [];
  }
}

function formatDeliveryLabel(value: string) {
  const map: Record<string, string> = {
    pickup: "Pickup",
    delivery: "Delivery",
    shipping: "Courier / Shipping",
    courier_shipping: "Courier / Shipping",
    digital: "Digital / Instant",
    hand_delivery: "Hand Delivery",
    meetup: "Meetup",
  };
  return map[value] || value;
}

const visibilityMap: Record<string, { label: string; icon: typeof Globe; color: string; description: string }> = {
  public: { label: "Public", icon: Globe, color: "text-blue-500", description: "Visible to everyone on your storefront" },
  buyer_specific: { label: "Buyer Specific", icon: Users, color: "text-amber-500", description: "Only visible to specific buyers" },
  private_draft: { label: "Private Draft", icon: Lock, color: "text-muted-foreground", description: "Hidden from all buyers" },
};

const SellerProductPreview = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const { data: dashData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["seller-product-detail", productId],
    queryFn: () => getSellerProductDetail(productId!),
    enabled: !!productId,
  });

  const sellerName = dashData?.seller?.full_name || "Seller";
  const avatarUrl = dashData?.seller?.avatar_url || null;
  const identityVerified = !!dashData?.seller?.identity_verified;
  const handleUnpublish = async (pid: string) => {
    setActionPending(true);
    try {
      await updateProduct(pid, { status: "draft" });
      toast.success("Product unpublished");
      setVisibilityModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["seller-product-detail", productId] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleArchive = async (pid: string) => {
    setActionPending(true);
    try {
      await archiveProduct(pid);
      toast.success("Product archived");
      setVisibilityModalOpen(false);
      navigate("/seller/storefront");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionPending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data?.product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <h2 className="text-xl font-bold text-foreground">Product not found</h2>
        <Button onClick={() => navigate("/seller/storefront")}>Back to Storefront</Button>
      </div>
    );
  }

  const product = data.product;
  const media = product.media || [];
  const heroImage = media[0];
  const thumbnails = media.slice(1);
  const deliveryMethods = parseDeliveryMethods(product.delivery_method);
  const vis = visibilityMap[product.visibility_type] || visibilityMap.public;
  const VisIcon = vis.icon;

  const isOutOfStock = product.stock_quantity === 0;
  const isLowStock = product.stock_quantity >= 1 && product.stock_quantity <= 5;
  const stockLabel = isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : "In Stock";
  const stockBadgeClass = isOutOfStock
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : isLowStock
    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";

  const storeSlug = (dashData?.seller as any)?.store_slug || product.store_slug;
  const publicUrl = storeSlug && product.slug ? `/store/${storeSlug}/${product.slug}` : null;

  const handleCopyLink = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(window.location.origin + publicUrl);
      toast.success("Link copied to clipboard");
    }
  };

  const sellerInitials = sellerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const memberSince = (dashData?.seller as any)?.created_at
    ? format(new Date((dashData.seller as any).created_at), "MMMM yyyy")
    : "—";

  return (
    <div className="flex min-h-[100dvh] bg-background lg:h-[100dvh] lg:overflow-hidden">
      <SellerStorefrontSidebar
        sellerName={sellerName}
        avatarUrl={avatarUrl}
        identityVerified={identityVerified}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 lg:px-8 py-4 border-b border-border relative z-10">
          <div className="flex items-center gap-4 lg:ml-0 ml-12">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl border border-border"
              onClick={() => navigate(`/seller/storefront/${productId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {heroImage && (
              <div className="hidden sm:block w-10 h-10 rounded-lg border border-border overflow-hidden bg-muted">
                <img src={heroImage.file_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground truncate max-w-[300px]">{product.title}</h1>
                <ProductStatusBadge status={product.status} />
              </div>
              <p className="text-sm text-muted-foreground">Product preview — read-only view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Static mode indicator, not a control — this page IS the preview. */}
            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </span>
            <Button
              size="sm"
              onClick={() => navigate(`/seller/storefront/${productId}`)}
              className="gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Product
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6 relative z-10">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
            {/* Main content — 2 cols */}
            <div className="xl:col-span-2 space-y-6">
              {/* Product Gallery */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Product Gallery</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {media.length} image{media.length !== 1 ? "s" : ""} uploaded
                  </p>
                </div>
                <div className="p-6">
                  {heroImage ? (
                    <div className="space-y-4">
                      <div className="w-full aspect-[16/10] rounded-xl border border-border overflow-hidden bg-muted">
                        {heroImage.media_type === "video" ? (
                          <video src={heroImage.file_url} className="w-full h-full object-contain" controls />
                        ) : (
                          <img src={heroImage.file_url} alt={product.title} className="w-full h-full object-contain" />
                        )}
                      </div>
                      {thumbnails.length > 0 && (
                        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                          {thumbnails.map((m: any) => (
                            <div key={m.id} className="aspect-square rounded-lg border border-border overflow-hidden bg-muted">
                              {m.media_type === "video" ? (
                                <video src={m.file_url} className="w-full h-full object-cover" />
                              ) : (
                                <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <ImageIcon className="h-12 w-12 mb-3 opacity-40" />
                      <p className="text-sm">No images uploaded yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Description */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <AlignLeft className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Product Description</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Detailed information about this product</p>
                </div>
                <div className="p-6 space-y-5">
                  {product.short_description && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-1.5">Overview</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{product.short_description}</p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1.5">Full Details</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{product.description || "—"}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Condition</p>
                      <p className="text-sm font-medium text-foreground">{formatCondition(product.condition_label)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Brand</p>
                      <p className="text-sm font-medium text-foreground">{product.brand || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Model / SKU</p>
                      <p className="text-sm font-medium text-foreground">{product.sku || product.model || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Agreement Terms */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Agreement Terms</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Transaction terms and delivery details</p>
                </div>
                <div className="p-6 space-y-5">
                  {/* SafeDeal Protection banner */}
                  <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
                    <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{alwaysClaim("ESCROW_PROTECTION_HEADING")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Buyer funds are held securely in escrow until the product is received and verified. Both parties are protected throughout the transaction.
                      </p>
                    </div>
                  </div>

                  {product.seller_notes && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-1.5">Seller Notes</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{product.seller_notes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Verification Window</p>
                      <p className="text-sm font-medium text-foreground">
                        {product.verification_window_hours
                          ? product.verification_window_hours >= 168
                            ? "1 week"
                            : `${product.verification_window_hours} hours`
                          : "48 hours"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Delivery Method{deliveryMethods.length !== 1 ? "s" : ""}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {deliveryMethods.length > 0 ? (
                          deliveryMethods.map((m) => (
                            <Badge key={m} variant="secondary" className="text-xs font-medium">
                              {formatDeliveryLabel(m)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seller Information */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Seller Information</h2>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16 border-2 border-muted">
                      <AvatarImage src={avatarUrl ?? undefined} alt={sellerName} />
                      <AvatarFallback className="bg-muted text-foreground text-sm">{sellerInitials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-base font-semibold text-foreground">{sellerName}</p>
                        {sellerVerificationClaim({ identityVerified }) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 border border-green-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            {sellerVerificationClaim({ identityVerified })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Member since {memberSince}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Rating</p>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                            <p className="text-sm font-semibold text-foreground">—</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Completed Sales</p>
                          <p className="text-sm font-semibold text-foreground">{(dashData?.metrics as any)?.transactions_created_count || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right sidebar — 1 col */}
            <div className="xl:col-span-1 space-y-6">
              {/* Pricing & Stock */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-base font-semibold text-foreground">Pricing & Stock</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Price</p>
                    <p className="text-2xl font-bold text-foreground">{formatPrice(product.unit_price)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Stock</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{product.stock_quantity} units</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stockBadgeClass}`}>
                        {stockLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <ProductStatusBadge status={product.status} />
                  </div>
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Visibility</p>
                    <div className="flex items-center gap-2">
                      <VisIcon className={`h-4 w-4 ${vis.color}`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{vis.label}</p>
                        <p className="text-xs text-muted-foreground">{vis.description}</p>
                      </div>
                    </div>
                  </div>
                  {publicUrl && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">Public Store Link</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-foreground bg-muted px-2 py-1 rounded flex-1 truncate">
                          {publicUrl}
                        </code>
                        <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCopyLink} aria-label="Copy public store link">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Performance */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-base font-semibold text-foreground">Performance</h3>
                </div>
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Views</span>
                    </div>
                    <span className="text-xs text-foreground">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Saved</span>
                    </div>
                    <span className="text-xs text-foreground">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Last Updated</span>
                    </div>
                    <span className="text-xs text-foreground">{relativeTime(product.updated_at)}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-base font-semibold text-foreground">Quick Actions</h3>
                </div>
                <div className="p-6 space-y-2">
                  <Button
                    size="sm"
                    className="w-full justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0"
                    onClick={() => navigate(`/seller/storefront/${productId}`)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Product
                  </Button>
                  {publicUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center gap-2 text-foreground"
                      onClick={() => window.open(publicUrl, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Preview Public Page
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2 text-foreground"
                    onClick={handleCopyLink}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share Product
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                    onClick={() => setVisibilityModalOpen(true)}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Unpublish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setVisibilityModalOpen(true)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive Product
                  </Button>
                </div>
              </div>

              {/* SafeDeal Protection */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border">
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
        onUnpublish={handleUnpublish}
        onArchive={handleArchive}
        isPending={actionPending}
      />
    </div>
  );
};

export default SellerProductPreview;
