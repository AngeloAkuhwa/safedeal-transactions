import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, RefreshCw, Store, Search, ShieldCheck, Star, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerStorefrontSidebar } from "@/components/storefront/SellerStorefrontSidebar";
import { SellerProductCard } from "@/components/storefront/SellerProductCard";
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

function getVerificationDotColor(level: string) {
  switch (level) {
    case "trusted_buyer": return "bg-emerald-400";
    case "basic_verified": return "bg-amber-400";
    default: return "bg-gray-400";
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
      getSellerProducts({ status: statusFilter, visibility: visibilityFilter, category: categoryFilter, search }),
    staleTime: 15_000,
  });

  const trust = data?.trust_summary;
  const sellerName = dashData?.seller?.full_name || "Seller";
  const avatarUrl = dashData?.seller?.avatar_url || null;
  const verificationLevel = trust?.verification_level || "unverified";

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0B1E]">
      <SellerStorefrontSidebar
        sellerName={sellerName}
        avatarUrl={avatarUrl}
        verificationLevel={verificationLevel}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 lg:px-8 py-5 border-b border-[#1E2040] relative z-10">
          <div className="lg:ml-0 ml-12">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Storefront</h1>
            <p className="text-[#8C8EAA] text-sm mt-0.5">Manage your product listings and public store</p>
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
        <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6 space-y-6 relative z-10">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
          ) : (
            <>
              {/* Trust Summary */}
              {trust && (
                <div className="bg-[#1E2040]/60 backdrop-blur-xl border border-[#30344F]/50 rounded-[24px] p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#30344F]">
                    {/* Store Status */}
                    <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-5 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-emerald-500/10 ring-2 ring-emerald-500/20">
                        <ShieldCheck className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-[#8C8EAA]">Store Status</p>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${getVerificationDotColor(trust.verification_level)}`} />
                          <p className="text-sm font-semibold text-white">
                            {getVerificationLabel(trust.verification_level)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Seller Rating */}
                    <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-5 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-500/10 ring-2 ring-amber-500/20">
                        <Star className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-[#8C8EAA]">Seller Rating</p>
                        <p className="text-sm font-semibold text-white">
                          {trust.rating != null
                            ? `${trust.rating} / 5.0 (${trust.review_count})`
                            : "No ratings yet"}
                        </p>
                      </div>
                    </div>

                    {/* Published Products */}
                    <div className="flex items-center gap-3 py-3 sm:py-0 sm:px-5 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-500/10 ring-2 ring-blue-500/20">
                        <Package className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs text-[#8C8EAA]">Published Products</p>
                        <p className="text-sm font-semibold text-white">
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
              <div className="bg-[#1E2040]/60 backdrop-blur-xl border border-[#30344F]/50 rounded-[24px] p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8C8EAA]" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#151730] border border-[#30344F] rounded-xl text-sm text-white placeholder:text-[#8C8EAA] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#151730] border border-[#30344F] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 appearance-none"
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
                    className="w-full px-3 py-2.5 bg-[#151730] border border-[#30344F] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 appearance-none"
                  >
                    <option value="all">All Visibility</option>
                    <option value="public">Public</option>
                    <option value="buyer_specific">Buyer Specific</option>
                    <option value="private_draft">Private</option>
                  </select>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#151730] border border-[#30344F] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 appearance-none"
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
                <div className="bg-[#1E2040]/60 backdrop-blur-xl border border-[#30344F]/50 rounded-[24px] p-12 text-center">
                  <RefreshCw className="h-12 w-12 text-red-400/30 mx-auto mb-4" />
                  <h2 className="text-lg font-bold text-white mb-2">Failed to load products</h2>
                  <p className="text-sm text-[#8C8EAA] mb-4">Something went wrong. Please try again.</p>
                  <Button onClick={() => refetch()} variant="outline" className="bg-[#1E2040] border-[#30344F] text-white hover:bg-[#30344F]">
                    Try Again
                  </Button>
                </div>
              ) : !data?.products?.length ? (
                <div className="bg-[#1E2040]/60 backdrop-blur-xl border border-[#30344F]/50 rounded-[24px] p-12 text-center">
                  <Store className="h-16 w-16 text-[#30344F] mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-white mb-2">No products yet</h2>
                  <p className="text-[#8C8EAA] text-sm max-w-md mx-auto mb-6">
                    Create your first product listing to start building your public storefront.
                  </p>
                  <Button
                    onClick={() => navigate("/seller/storefront/new")}
                    className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 rounded-xl"
                  >
                    <Plus className="h-4 w-4" />
                    Add Your First Product
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {data.products.map((product: any) => (
                      <SellerProductCard
                        key={product.id}
                        product={product}
                        onClick={() => navigate(`/seller/storefront/${product.id}`)}
                        onEdit={() => navigate(`/seller/storefront/${product.id}`)}
                      />
                    ))}
                  </div>
                  {data.total > data.page_size && (
                    <p className="text-center text-sm text-[#8C8EAA] mt-6">
                      Showing {data.products.length} of {data.total} products
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SellerStorefront;
