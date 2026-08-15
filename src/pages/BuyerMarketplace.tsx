import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { MarketplaceProductCard } from "@/components/marketplace/MarketplaceProductCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, ShoppingBag, PackageOpen, Shield, Lock, Clock, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input as PriceInput } from "@/components/ui/input";
import { getMarketplaceProducts } from "@/services/marketplace.service";
import { useAuthState } from "@/hooks/useSavedProducts";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export default function BuyerMarketplace() {
  usePageMeta({
    title: "Marketplace Listings | SafeDeal",
    description:
      "Browse products listed by independent sellers and review each seller's item and delivery terms before checkout.",
    path: "/marketplace",
  });
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthState();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") || "");
  const [category, setCategory] = useState(() => searchParams.get("category") || "");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [appliedPriceMin, setAppliedPriceMin] = useState<string>("");
  const [appliedPriceMax, setAppliedPriceMax] = useState<string>("");
  const [priceOpen, setPriceOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCategoryChange = useCallback((val: string) => {
    setCategory(val === "all" ? "" : val);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((val: string) => {
    setSort(val);
    setPage(1);
  }, []);

  const applyPriceFilter = useCallback(() => {
    setAppliedPriceMin(priceMin);
    setAppliedPriceMax(priceMax);
    setPage(1);
    setPriceOpen(false);
  }, [priceMin, priceMax]);

  const clearPriceFilter = useCallback(() => {
    setPriceMin("");
    setPriceMax("");
    setAppliedPriceMin("");
    setAppliedPriceMax("");
    setPage(1);
    setPriceOpen(false);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["marketplace", debouncedSearch, category, sort, page, appliedPriceMin, appliedPriceMax],
    placeholderData: keepPreviousData,
    queryFn: () =>
      getMarketplaceProducts({
        search: debouncedSearch || undefined,
        category: category || undefined,
        sort,
        page,
        price_min: appliedPriceMin ? Number(appliedPriceMin) : undefined,
        price_max: appliedPriceMax ? Number(appliedPriceMax) : undefined,
      }),
  });

  const products = data?.products || [];
  const categories = data?.categories || [];
  const total = data?.total || 0;
  const pageSize = data?.page_size || 20;
  const totalPages = Math.ceil(total / pageSize);

  const categoryMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => {
      m[c.id] = c.name;
    });
    return m;
  }, [categories]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background lg:h-[100dvh] lg:flex-row lg:overflow-hidden">
      {/* Signed out, this page had no chrome at all — no logo, no route back to
          the site, no way to sign up. A visitor arriving on a shared product
          link could browse and then had nowhere to go. */}
      {!isAuthenticated && <PublicPageHeader current="marketplace" />}

      <div className="flex flex-1 lg:overflow-hidden">
      {isAuthenticated && <BuyerSidebar />}

      <main className="relative min-w-0 flex-1 lg:overflow-y-auto">
        {/* Background glows */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 -left-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

        <div className="sd-page sd-page-y space-y-4 relative z-rail">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="sd-page-title flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-primary" />
                Marketplace
              </h1>
              <p className="sd-page-sub">
                 Browse products from independent sellers across SafeDeal
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1">
              <Shield className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-medium text-success">Checkout records payment and release terms</span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for electronics, fashion, vehicles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 border-none bg-muted/50"
              />
            </div>
            <Select value={category || "all"} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-full sm:w-[180px] border-none bg-muted/50">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.product_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-full sm:w-[200px] border-none bg-muted/50">
                <span className="text-muted-foreground mr-1">Sort by:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="price_asc">Price: Low → High</SelectItem>
                <SelectItem value="price_desc">Price: High → Low</SelectItem>
              </SelectContent>
            </Select>
            <Popover open={priceOpen} onOpenChange={setPriceOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`border-none bg-muted/50 gap-2 shrink-0 ${appliedPriceMin || appliedPriceMax ? "ring-2 ring-primary" : ""}`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {appliedPriceMin || appliedPriceMax
                    ? `${appliedPriceMin ? Number(appliedPriceMin).toLocaleString() : "0"} – ${appliedPriceMax ? Number(appliedPriceMax).toLocaleString() : "∞"}`
                    : "Price Filter"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-3" align="end">
                <p className="text-sm font-medium">Price Range</p>
                <div className="flex gap-2">
                  <PriceInput
                    type="number"
                    placeholder="Min"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    min={0}
                  />
                  <PriceInput
                    type="number"
                    placeholder="Max"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    min={0}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={applyPriceFilter}>Apply</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={clearPriceFilter}>Clear</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Results count */}
          {!isLoading && (
            <p className="text-sm text-muted-foreground">
              {total} product{total !== 1 ? "s" : ""} found
            </p>
          )}

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
                  {/* Matches the real card: square media well + two text lines */}
                  <div className="aspect-square w-full bg-muted animate-pulse" />
                  <div className="space-y-2 p-3">
                    <div className="h-3.5 w-4/5 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <PackageOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-foreground">No products found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <MarketplaceProductCard
                  key={product.id}
                  product={product}
                  categoryName={
                    product.category_id ? categoryMap[product.category_id] : undefined
                  }
                  onClick={() => {
                    if (product.seller.store_slug) {
                      navigate(`/store/${product.seller.store_slug}/${product.slug}`);
                    }
                  }}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                {page > 1 && (
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setPage(page - 1)} href="#" />
                  </PaginationItem>
                )}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        href="#"
                        isActive={pageNum === page}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                {page < totalPages && (
                  <PaginationItem>
                    <PaginationNext onClick={() => setPage(page + 1)} href="#" />
                  </PaginationItem>
                )}
              </PaginationContent>
            </Pagination>
          )}

          {/* Trust footer */}
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-5">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">
                  SafeDeal checkout
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review the item, seller, delivery method, and payment terms before you pay.
                </p>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <Lock className="mx-auto h-4 w-4 text-primary mb-1" />
                  <p className="text-xs font-semibold text-foreground">Item terms</p>
                  <p className="text-xs text-muted-foreground">Recorded</p>
                </div>
                <div className="text-center">
                  <Clock className="mx-auto h-4 w-4 text-primary mb-1" />
                  <p className="text-xs font-semibold text-foreground">Delivery</p>
                  <p className="text-xs text-muted-foreground">Selected</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}
