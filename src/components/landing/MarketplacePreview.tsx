import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShoppingBag, Shield, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketplaceProductCard } from "@/components/marketplace/MarketplaceProductCard";
import { getMarketplaceProducts } from "@/services/marketplace.service";
import { useAuthState } from "@/hooks/useSavedProducts";

const PREVIEW_LIMIT = 8;

export function MarketplacePreview() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthState();
  const [browseHref, setBrowseHref] = useState("/marketplace");

  useEffect(() => {
    setBrowseHref(isAuthenticated ? "/dashboard/marketplace" : "/marketplace");
  }, [isAuthenticated]);

  const { data, isLoading } = useQuery({
    queryKey: ["marketplace-preview"],
    queryFn: () =>
      getMarketplaceProducts({ sort: "newest", page: 1 }),
    staleTime: 60_000,
  });

  const products = (data?.products ?? []).slice(0, PREVIEW_LIMIT);
  const categoryMap: Record<string, string> = {};
  for (const c of data?.categories ?? []) categoryMap[c.id] = c.name;
  const topCategories = useMemo(() => (data?.categories ?? []).slice(0, 6), [data]);
  const [searchValue, setSearchValue] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    navigate(q ? `/marketplace?search=${encodeURIComponent(q)}` : "/marketplace");
  };

  return (
    <section
      id="marketplace"
      className="bg-background py-16 sm:py-20"
      aria-labelledby="marketplace-preview-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
              <ShoppingBag className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Live listings</span>
            </div>
            <h2
              id="marketplace-preview-heading"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground"
            >
              Browse the marketplace
            </h2>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground">
              Real listings from verified sellers on SafeDeal. Browse freely — sign up only when you're ready to buy.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 sm:flex">
            <Shield className="h-4 w-4 text-success" />
            <span className="text-xs font-medium text-success">All purchases protected by escrow</span>
          </div>
        </div>

        {/* Search + chips */}
        <form onSubmit={handleSearch} className="mx-auto mt-8 max-w-2xl">
          <div className="relative">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search phones, laptops, fashion, electronics…"
              className="w-full rounded-xl border-2 border-border bg-card px-5 py-3.5 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:text-base"
              aria-label="Search marketplace"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        {topCategories.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              to="/marketplace"
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:text-sm"
            >
              All
            </Link>
            {topCategories.map((c) => (
              <Link
                key={c.id}
                to={`/marketplace?category=${c.id}`}
                className="rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent sm:text-sm"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="mt-10">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: PREVIEW_LIMIT }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-2xl bg-muted/60 animate-pulse"
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
              <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-foreground">
                More listings coming soon
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sellers are joining daily — check back shortly.
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
        </div>

        {/* CTA */}
        <div className="mt-10 flex justify-center">
          <Button asChild size="lg" className="gap-2">
            <Link to={browseHref}>
              <Store className="h-4 w-4" />
              Browse all listings
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}