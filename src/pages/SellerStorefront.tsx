import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, RefreshCw, Store, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { ProductCard } from "@/components/storefront/ProductCard";
import { StorefrontShareCard } from "@/components/storefront/StorefrontShareCard";
import { getSellerProducts, getProductCategories } from "@/services/seller-storefront.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav
        sellerName={dashData?.seller?.full_name || "Seller"}
        avatarUrl={dashData?.seller?.avatar_url || null}
      />

      <div className="bg-gradient-to-br from-sky-50 via-background to-green-50 dark:from-sky-950/20 dark:via-background dark:to-green-950/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Storefront</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Manage your product listings and public store
              </p>
            </div>
            <Button
              onClick={() => navigate("/seller/storefront/new")}
              className="bg-success hover:bg-success/90 text-white gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>

          <StorefrontShareCard storeSlug={data?.store_slug || null} />
        </div>
      </div>

      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
                Create your first product listing to start building your public storefront.
              </p>
              <Button
                onClick={() => navigate("/seller/storefront/new")}
                className="bg-success hover:bg-success/90 text-white gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Your First Product
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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

      <Footer />
    </div>
  );
};

export default SellerStorefront;
