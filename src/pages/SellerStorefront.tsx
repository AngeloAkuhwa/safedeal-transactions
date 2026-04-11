import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, RefreshCw, Store, Search, ShieldCheck, Star, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SellerNav } from "@/components/seller/SellerNav";
import { ProductCard } from "@/components/storefront/ProductCard";
import { StorefrontShareCard } from "@/components/storefront/StorefrontShareCard";
import { getSellerProducts, getProductCategories } from "@/services/seller-storefront.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";

function getVerificationLabel(level: string) {
  switch (level) {
    case "trusted_buyer": return "Verified Seller";
    case "basic_verified": return "Basic Verified";
    default: return "Unverified";
  }
}

function getVerificationColor(level: string) {
  switch (level) {
    case "trusted_buyer": return "text-emerald-600 bg-emerald-100 ring-emerald-200";
    case "basic_verified": return "text-amber-600 bg-amber-100 ring-amber-200";
    default: return "text-muted-foreground bg-muted ring-border";
  }
}

const SellerStorefront = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

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
    queryKey: ["seller-products", statusFilter, visibilityFilter, categoryFilter, search],
    queryFn: () =>
      getSellerProducts({
        status: statusFilter,
        visibility: visibilityFilter,
        category: categoryFilter,
        search,
      }),
    staleTime: 15_000,
  });

  const trust = data?.trust_summary;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav
        sellerName={dashData?.seller?.full_name || "Seller"}
        avatarUrl={dashData?.seller?.avatar_url || null}
      />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Storefront</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Manage your product listings and public store
              </p>
            </div>
            <Button
              onClick={() => navigate("/seller/storefront/new")}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>

          {/* Trust Summary */}
          {trust && (
            <div className="rounded-xl border bg-card p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
                {/* Store Status */}
                <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-4 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                  <div className={`flex items-center justify-center h-10 w-10 rounded-full ring-2 ${getVerificationColor(trust.verification_level)}`}>
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Store Status</p>
                    <p className="text-sm font-semibold text-foreground">
                      {getVerificationLabel(trust.verification_level)}
                    </p>
                  </div>
                </div>

                {/* Seller Rating */}
                <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-4 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-full ring-2 text-amber-600 bg-amber-100 ring-amber-200">
                    <Star className="h-5 w-5" />
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
                <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-4 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-full ring-2 text-primary bg-primary/10 ring-primary/20">
                    <Package className="h-5 w-5" />
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
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Visibility</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="buyer_specific">Buyer Specific</SelectItem>
                <SelectItem value="private_draft">Private</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(categories || []).map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product Grid */}
          {isError ? (
            <div className="rounded-2xl border bg-card p-12 text-center">
              <RefreshCw className="h-12 w-12 text-destructive/30 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Failed to load products</h2>
              <Button onClick={() => refetch()} variant="outline">Try Again</Button>
            </div>
          ) : !data?.products?.length ? (
            <div className="rounded-2xl border bg-card p-12 text-center">
              <Store className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">No products yet</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
                Create your first product listing to start building your public storefront. Published products will appear on your public store URL.
              </p>
              <Button
                onClick={() => navigate("/seller/storefront/new")}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Your First Product
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {data.products.map((product: any) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => navigate(`/seller/storefront/${product.id}`)}
                    showBadges
                  />
                ))}
              </div>
              {data.total > data.page_size && (
                <p className="text-center text-sm text-muted-foreground mt-6">
                  Showing {data.products.length} of {data.total} products
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default SellerStorefront;
