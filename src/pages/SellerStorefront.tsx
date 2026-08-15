import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Plus, RefreshCw, Store, Search, ShieldCheck, Star, Package, PackageOpen, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerStorefrontSidebar } from "@/components/storefront/SellerStorefrontSidebar";
import { SellerProductCard } from "@/components/storefront/SellerProductCard";
import { StorefrontShareCard } from "@/components/storefront/StorefrontShareCard";
import { ManageVisibilityModal } from "@/components/storefront/ManageVisibilityModal";
import { UpdateStockModal } from "@/components/storefront/UpdateStockModal";
import { getSellerProducts, getProductCategories, updateProduct, archiveProduct, duplicateProduct } from "@/services/seller-storefront.service";
import { setStockQuantity } from "@/services/inventory.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { toast } from "@/components/ui/sonner";
import { useVendorPlan } from "@/hooks/useVendorPlan";
import { sellerVerificationClaim } from "@/lib/trust/trust-claims";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The verification claim is driven by `identity_verified` only — the declared
 * basis of SELLER_VERIFIED. `verification_level` is an internal trust tier and
 * never on its own earns a verification badge.
 */
function getVerificationLabel(identityVerified: boolean) {
  const claim = sellerVerificationClaim({ identityVerified });
  return claim ?? "Standard account";
}

function getVerificationDotColor(identityVerified: boolean) {
  return identityVerified ? "bg-primary" : "bg-muted-foreground";
}

const SellerStorefront = () => {
  const navigate = useNavigate();
  // Showcase-slot usage (display only; the server enforces the cap).
  const { state: planState } = useVendorPlan();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialStatusFilter = (() => {
    const f = searchParams.get("filter");
    return f === "low_stock" || f === "out_of_stock" ? f : "all";
  })();
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Debounced so the list keeps rendering (and the input keeps focus) while typing.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [manageProduct, setManageProduct] = useState<any>(null);
  const [stockProduct, setStockProduct] = useState<any>(null);
  const [actionPending, setActionPending] = useState(false);
  const [stockPending, setStockPending] = useState(false);

  const handleDuplicate = async (productId: string) => {
    try {
      const res = await duplicateProduct(productId);
      toast.success("Product duplicated as draft", {
        action: {
          label: "Edit Draft",
          onClick: () => navigate(`/seller/storefront/${res.id}`),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to duplicate product");
    }
  };

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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["seller-products", statusFilter, visibilityFilter, categoryFilter, debouncedSearch],
    queryFn: () =>
      getSellerProducts({
        status: statusFilter === "low_stock" ? "all" : statusFilter,
        visibility: visibilityFilter,
        category: categoryFilter,
        search: debouncedSearch,
      }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const isLowStockProduct = (p: any) => {
    const available = (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0);
    return available >= 1 && available <= 5;
  };
  const displayedProducts = statusFilter === "low_stock"
    ? (data?.products ?? []).filter(isLowStockProduct)
    : data?.products;

  const trust = data?.trust_summary;
  const sellerName = dashData?.seller?.full_name || "Seller";
  const avatarUrl = dashData?.seller?.avatar_url || null;
  const identityVerified = !!trust?.identity_verified;
  const handleUnpublish = async (productId: string) => {
    setActionPending(true);
    try {
      await updateProduct(productId, { status: "draft" });
      toast.success("Product unpublished");
      setManageProduct(null);
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleSaveStock = async (productId: string, newQuantity: number) => {
    setStockPending(true);
    try {
      await setStockQuantity(productId, newQuantity, "Stock updated via Update Stock modal");
      toast.success("Stock updated successfully");
      setStockProduct(null);
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setStockPending(false);
    }
  };

  const handleArchive = async (productId: string) => {
    setActionPending(true);
    try {
      await archiveProduct(productId);
      toast.success("Product archived");
      setManageProduct(null);
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] bg-background lg:h-[100dvh] lg:overflow-hidden">
      <SellerStorefrontSidebar
        sellerName={sellerName}
        avatarUrl={avatarUrl}
        identityVerified={identityVerified}
      />

      <div className="flex-1 flex flex-col lg:overflow-hidden relative">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 lg:px-8 py-5 border-b border-border relative z-10">
          <div className="lg:ml-0 ml-12">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Storefront</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Manage your product listings and public store</p>
            {planState && (
              <p className="text-xs text-muted-foreground mt-1">
                {planState.showcase_slots.used} of {planState.showcase_slots.limit} showcase slots used
                {planState.showcase_slots.remaining === 0 ? " — " : " · "}
                <Link to="/seller/profile?section=plan" className="text-primary hover:underline">
                  {planState.showcase_slots.remaining === 0 ? "Add slots or upgrade" : "Manage plan"}
                </Link>
              </p>
            )}
          </div>
          <Button
            onClick={() => navigate("/seller/storefront/new")}
            className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 rounded-xl"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 px-4 sm:px-6 lg:overflow-y-auto lg:px-8 py-6 space-y-6 relative z-10">
          {isLoading && (
            <div className="space-y-6">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 rounded-2xl" />
                ))}
              </div>
            </div>
          )}
          {!isLoading && (
            <>
              {/* Trust Summary */}
              {trust && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    {/* Store Status */}
                    <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-5 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-emerald-500/10 ring-2 ring-emerald-500/20">
                        <ShieldCheck className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Store Status</p>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${getVerificationDotColor(trust.identity_verified === true)}`} />
                          <p className="text-sm font-semibold text-foreground">
                            {getVerificationLabel(trust.identity_verified === true)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Seller Rating */}
                    <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-5 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-500/10 ring-2 ring-amber-500/20">
                        <Star className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Seller Rating</p>
                        <p className="text-sm font-semibold text-foreground">
                          {trust.rating != null
                            ? `${trust.rating} / 5.0 (${trust.review_count})`
                            : "No ratings yet"}
                        </p>
                      </div>
                    </div>

                    {/* Published Products */}
                    <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-5 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-500/10 ring-2 ring-blue-500/20">
                        <Package className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Published Products</p>
                        <p className="text-sm font-semibold text-foreground">
                          {trust.published_count} Active
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Share Card */}
              <StorefrontShareCard storeSlug={data?.store_slug || null} />

              {/* Filters */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 min-h-11"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 appearance-none min-h-11"
                  >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="out_of_stock">Out of Stock</option>
                    <option value="archived">Archived</option>
                  </select>
                  <select
                    value={visibilityFilter}
                    onChange={(e) => setVisibilityFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 appearance-none min-h-11"
                  >
                    <option value="all">All Visibility</option>
                    <option value="public">Public</option>
                    <option value="buyer_specific">Private</option>
                    <option value="private_draft">Draft</option>
                  </select>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 appearance-none min-h-11"
                  >
                    <option value="all">All Categories</option>
                    {(categories || []).map((cat: any) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Grid */}
              {isError ? (
                <div className="bg-card border border-border rounded-2xl p-12 text-center">
                  <RefreshCw className="h-12 w-12 text-destructive/30 mx-auto mb-4" />
                  <h2 className="text-lg font-bold text-foreground mb-2">Failed to load products</h2>
                  <p className="text-sm text-muted-foreground mb-4">Something went wrong. Please try again.</p>
                  <Button onClick={() => refetch()} variant="outline">
                    Try Again
                  </Button>
                </div>
              ) : !displayedProducts?.length ? (
                <div className="bg-card border border-border rounded-2xl p-16 flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <PackageOpen className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-3">You haven't added any products yet</h2>
                  <p className="text-muted-foreground text-sm max-w-lg mx-auto mb-8 leading-relaxed">
                    Start building your storefront by adding your first product. Once listed, buyers can discover and purchase directly from your public store page.
                  </p>
                  <Button
                    onClick={() => navigate("/seller/storefront/new")}
                    size="lg"
                    className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground border-0 rounded-xl px-8 py-4 text-base"
                  >
                    <Plus className="h-5 w-5" />
                    Add Your First Product
                  </Button>

                  <div className="mt-10 max-w-md w-full rounded-xl border border-primary/20 bg-primary/5 p-5 text-left">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <Lightbulb className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">Pro Tip</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Once you add a product, you can share your storefront link with buyers. They'll be able to browse your listings and start transactions directly.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {displayedProducts.map((product: any) => (
                      <SellerProductCard
                        key={product.id}
                        product={product}
                        onClick={() => navigate(`/seller/storefront/${product.id}`)}
                        onEdit={() => navigate(`/seller/storefront/${product.id}`)}
                        onManageVisibility={() => setManageProduct(product)}
                        onUpdateStock={() => setStockProduct(product)}
                        onDuplicate={() => handleDuplicate(product.id)}
                      />
                    ))}
                  </div>
                  {statusFilter !== "low_stock" && data.total > data.page_size && (
                    <p className="text-center text-sm text-muted-foreground mt-6">
                      Showing {displayedProducts.length} of {data.total} products
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <ManageVisibilityModal
        open={!!manageProduct}
        onOpenChange={(open) => !open && setManageProduct(null)}
        product={manageProduct}
        onUnpublish={handleUnpublish}
        onArchive={handleArchive}
        isPending={actionPending}
      />
      <UpdateStockModal
        open={!!stockProduct}
        onOpenChange={(open) => !open && setStockProduct(null)}
        product={stockProduct}
        onSave={handleSaveStock}
        isPending={stockPending}
      />
    </div>
  );
};

export default SellerStorefront;
