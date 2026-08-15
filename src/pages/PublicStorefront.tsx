import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Shield, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/landing/Footer";
import { ProductCard } from "@/components/storefront/ProductCard";
import { PublicStorefrontHeader } from "@/components/storefront/PublicStorefrontHeader";
import { getPublicStorefront } from "@/services/public-storefront.service";
import { getProductCategories } from "@/services/seller-storefront.service";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Skeleton } from "@/components/ui/skeleton";

const PublicStorefront = () => {
  const { sellerSlug } = useParams<{ sellerSlug: string }>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: categories } = useQuery({
    queryKey: ["product-categories"],
    queryFn: getProductCategories,
    staleTime: 300_000,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["public-storefront", sellerSlug, debouncedSearch, categoryFilter],
    queryFn: () => getPublicStorefront(sellerSlug!, { search: debouncedSearch, category: categoryFilter }),
    enabled: !!sellerSlug,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const storeName = data?.seller?.full_name ?? "";
  usePageMeta({
    title: `${storeName} — Store | SafeDeal`,
    description: `Shop ${storeName} on SafeDeal and review item, delivery, and payment terms before checkout.`,
    path: `/store/${sellerSlug ?? ""}`,
    image: data?.seller?.avatar_url ?? null,
    enabled: Boolean(storeName),
  });

  const showInitialSkeleton = isLoading;

  if (showInitialSkeleton && !data) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <Skeleton className="h-14 w-full rounded-none" />
        <Skeleton className="h-48 w-full rounded-none" />
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8"><Skeleton className="h-11 w-full max-w-sm" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-lg" />)}</div></div>
      </div>
    );
  }

  if (isError || !data?.seller) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <Store className="h-16 w-16 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold">Store not found</h1>
        <p className="text-muted-foreground">This store doesn't exist or has no products.</p>
        <Button asChild>
          <Link to="/">Go to SafeDeal</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Minimal header */}
      <header className="sticky top-0 z-sticky border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-h-11">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-bold text-foreground">SafeDeal</span>
          </Link>
          <Button size="sm" variant="outline" asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </header>

      <PublicStorefrontHeader seller={data.seller} productCount={data.total} />

      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6" aria-busy={isFetching}>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(categories || []).map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!data.products?.length ? (
            <div className="rounded-2xl border bg-card p-12 text-center">
              <Store className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">No products listed yet</h2>
              <p className="text-muted-foreground text-sm">
                This seller hasn't published any products yet. Check back later!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.products.map((product: any) => (
                <Link
                  key={product.id}
                  to={`/store/${sellerSlug}/${product.slug}`}
                  className="block min-h-11"
                >
                  <ProductCard product={product} showBadges={false} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PublicStorefront;
