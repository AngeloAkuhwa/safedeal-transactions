import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { BuyerSidebar } from "@/components/marketplace/BuyerSidebar";
import { useSavedProducts, useToggleSave } from "@/hooks/useSavedProducts";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Heart, Search, BookmarkX, X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { resolveClaim } from "@/lib/trust/trust-claims";
import { formatMoney } from "@/lib/format";
import { keyActivate } from "@/lib/a11y";
import { Skeleton } from "@/components/ui/skeleton";

const formatPrice = (amount: number, currency: string) => formatMoney(amount, currency);

function getStockInfo(qty: number) {
  if (qty <= 0) return { label: "Out of Stock", cls: "bg-muted text-muted-foreground" };
  if (qty <= 5) return { label: "Low Stock", cls: "border border-warning/30 bg-warning/10 text-foreground" };
  return { label: "In Stock", cls: "border border-success/30 bg-success/10 text-foreground" };
}

export default function BuyerSavedProducts() {
  const navigate = useNavigate();
  const { data, isLoading } = useSavedProducts();
  const toggleSave = useToggleSave();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("recent");
  const [showBanner, setShowBanner] = useState(true);

  const items = data?.items || [];

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item: any) => {
      if (item.category) map.set(item.category.slug, item.category.name);
    });
    return Array.from(map, ([slug, name]) => ({ slug, name }));
  }, [items]);

  const filtered = useMemo(() => {
    let result = [...items];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((item: any) =>
        item.title.toLowerCase().includes(q) ||
        item.seller?.full_name?.toLowerCase().includes(q)
      );
    }
    if (category !== "all") {
      result = result.filter((item: any) => item.category?.slug === category);
    }
    if (sort === "price_low") result.sort((a: any, b: any) => a.unit_price - b.unit_price);
    else if (sort === "price_high") result.sort((a: any, b: any) => b.unit_price - a.unit_price);
    else if (sort === "name") result.sort((a: any, b: any) => a.title.localeCompare(b.title));
    return result;
  }, [items, search, category, sort]);

  const handleUnsave = (productId: string) => {
    toggleSave.mutate({ productId, saved: true });
    toast.success("Removed from saved items");
  };

  return (
    <div className="flex min-h-[100dvh] bg-background lg:h-[100dvh] lg:overflow-hidden">
      <BuyerSidebar />
      <main className="relative min-w-0 flex-1 lg:overflow-y-auto">
        <div className="sd-page sd-page-y space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Heart className="h-4 w-4 text-primary" />
              <div>
                <h1 className="sd-page-title">Saved Products</h1>
                <p className="sd-page-sub">Products you've saved for later</p>
              </div>
            </div>
            <Badge className="self-start sm:self-auto bg-primary/10 text-primary border-primary/20 px-2 py-0.5">
              {items.length} {items.length === 1 ? "item" : "items"}
            </Badge>
          </div>

          {/* Info banner */}
          {showBanner && (
            <div className="flex items-center justify-between gap-3 p-3 px-4 rounded-xl bg-primary/5 border border-primary/10">
              <p className="text-sm text-muted-foreground">
                Saved products may sell out or be removed by the seller. Purchase soon to avoid disappointment.
              </p>
              <button onClick={() => setShowBanner(false)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors relative inline-flex items-center justify-center before:absolute before:-inset-3.5 before:content-[''] min-h-11 min-w-11">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 rounded-lg border bg-card p-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search saved products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-11 text-xs"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-11 text-xs sm:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug} className="text-xs">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-11 text-xs sm:w-44">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent" className="text-xs">Recently Saved</SelectItem>
                <SelectItem value="price_low" className="text-xs">Price: Low → High</SelectItem>
                <SelectItem value="price_high" className="text-xs">Price: High → Low</SelectItem>
                <SelectItem value="name" className="text-xs">Name A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="grid grid-cols-2 gap-4 py-6 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-xl" />)}
            </div>
          )}

          {/* Empty */}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <BookmarkX className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h2 className="text-xl font-bold text-foreground">No saved products</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {search || category !== "all"
                  ? "No products match your filters. Try adjusting your search."
                  : "Browse the marketplace and tap the heart icon to save products for later."}
              </p>
              <Button onClick={() => navigate("/dashboard/marketplace")} className="rounded-xl">
                Browse Marketplace
              </Button>
            </div>
          )}

          {/* Product Grid */}
          {!isLoading && filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((item: any) => {
                const outOfStock = item.stock_quantity <= 0;
                const stock = getStockInfo(item.stock_quantity);
                const sellerInitial = (item.seller?.full_name || "S")[0].toUpperCase();
                const verifiedSellerClaim = resolveClaim("SELLER_VERIFIED", { identityVerified: item.seller?.trust_summary?.identity_verified });

                return (
                  <div role="button" tabIndex={0} onKeyDown={keyActivate}
                    key={item.id}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer",
                      outOfStock && "opacity-75"
                    )}
                    onClick={() => {
                      if (item.seller?.store_slug) {
                        navigate(`/store/${item.seller.store_slug}/${item.slug}`);
                      }
                    }}
                  >
                    {/* Image */}
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      {item.primary_image_url ? (
                        <img
                          src={item.primary_image_url}
                          alt={item.title}
                          className={cn(
                            "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
                            outOfStock && "grayscale"
                          )}
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Heart className="h-12 w-12 text-muted-foreground/20" />
                        </div>
                      )}

                      {/* Stock badge: top left */}
                      <span className={cn("absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold", stock.cls)}>
                        {stock.label}
                      </span>

                      {/* Heart button: top right */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnsave(item.id); }}
                        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/90 backdrop-blur-sm text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors relative before:absolute before:-inset-2 before:content-['']"
                      >
                        <Heart className="h-5 w-5 fill-current" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-5">
                      {/* Category */}
                      {item.category && (
                        <Badge variant="secondary" className="self-start mb-2 text-xs font-medium">
                          {item.category.name}
                        </Badge>
                      )}

                      <h3 className="mb-1 line-clamp-2 text-lg font-semibold text-foreground leading-snug">
                        {item.title}
                      </h3>
                      {item.short_description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                          {item.short_description}
                        </p>
                      )}

                      {/* Seller row */}
                      <div className="mb-3 pb-3 border-b border-border flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                            {sellerInitial}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm font-medium text-foreground">{item.seller?.full_name}</span>
                        {verifiedSellerClaim && (
                          <Badge variant="outline" className="ml-auto text-xs px-2 py-0.5">
                            {verifiedSellerClaim}
                          </Badge>
                        )}
                      </div>

                      {/* Price + CTA */}
                      <div className="mt-auto space-y-3">
                        <p className="text-lg font-bold tabular-nums text-foreground">
                          {formatPrice(item.unit_price, item.currency_code)}
                        </p>
                        <Button
                          className={cn(
                            "w-full h-11 rounded-xl text-sm font-semibold",
                            outOfStock
                              ? "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed"
                              : "bg-primary text-primary-foreground hover:bg-primary/90 text-primary-foreground"
                          )}
                          disabled={outOfStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.seller?.store_slug) {
                              navigate(`/store/${item.seller.store_slug}/${item.slug}`);
                            }
                          }}
                        >
                          {outOfStock ? "Currently Unavailable" : "Buy with Protection"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
