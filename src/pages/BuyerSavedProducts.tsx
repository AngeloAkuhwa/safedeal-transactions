import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Heart, Search, ShieldCheck, Package, Loader2, Info, BookmarkX, CheckCircle,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

function formatPrice(amount: number, currency: string) {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString()}`;
  return `${currency} ${Number(amount).toLocaleString()}`;
}

export default function BuyerSavedProducts() {
  const navigate = useNavigate();
  const { data, isLoading } = useSavedProducts();
  const toggleSave = useToggleSave();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("recent");

  const items = data?.items || [];

  // Unique categories from saved items
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item: any) => {
      if (item.category) map.set(item.category.slug, item.category.name);
    });
    return Array.from(map, ([slug, name]) => ({ slug, name }));
  }, [items]);

  // Filter + sort
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
    // default "recent" is already ordered by saved_at desc
    return result;
  }, [items, search, category, sort]);

  const handleUnsave = (productId: string) => {
    toggleSave.mutate({ productId, saved: true });
    toast.success("Removed from saved items");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <BuyerSidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Heart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                Saved Products
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{items.length} items</Badge>
              </h1>
              <p className="text-sm text-muted-foreground">Products you've saved for later</p>
            </div>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Items may become unavailable</p>
              <p className="text-xs text-muted-foreground">
                Saved products may sell out or be removed by the seller. Purchase soon to avoid disappointment.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search saved products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-44 rounded-xl">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-full sm:w-44 rounded-xl">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently Saved</SelectItem>
                <SelectItem value="price_low">Price: Low → High</SelectItem>
                <SelectItem value="price_high">Price: High → Low</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((item: any) => {
                const outOfStock = item.stock_quantity <= 0;
                const sellerInitial = (item.seller?.full_name || "S")[0].toUpperCase();
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm transition-all hover:shadow-lg cursor-pointer",
                      outOfStock && "opacity-70"
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
                          <Package className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}

                      {outOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <span className="rounded-full bg-destructive/90 px-3 py-1 text-xs font-semibold text-destructive-foreground">
                            Out of Stock
                          </span>
                        </div>
                      )}

                      {/* Filled heart (unsave) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsave(item.id);
                        }}
                        className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm text-destructive"
                      >
                        <Heart className="h-4 w-4 fill-current" />
                      </button>

                      {/* Category badge */}
                      {item.category && (
                        <Badge className="absolute left-2.5 top-2.5 bg-background/80 text-foreground backdrop-blur-sm border-none text-[11px]">
                          {item.category.name}
                        </Badge>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-3.5">
                      <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-foreground leading-tight">
                        {item.title}
                      </h3>
                      {item.short_description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {item.short_description}
                        </p>
                      )}

                      {/* Seller row */}
                      <div className="mb-2 flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="bg-gradient-to-br from-primary to-blue-400 text-[10px] font-bold text-white">
                            {sellerInitial}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-xs text-muted-foreground">{item.seller?.full_name}</span>
                        {item.seller?.trust_summary?.email_verified && (
                          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </div>

                      {/* Price + CTA */}
                      <div className="mt-auto space-y-2">
                        <div>
                          <span className="text-[10px] text-muted-foreground">Escrow Price</span>
                          <p className="text-base font-bold text-foreground leading-tight">
                            {formatPrice(item.unit_price, item.currency_code)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="w-full rounded-lg gap-1.5 text-xs"
                          disabled={outOfStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.seller?.store_slug) {
                              navigate(`/store/${item.seller.store_slug}/${item.slug}`);
                            }
                          }}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {outOfStock ? "Out of Stock" : "Buy with SafeDeal Protection"}
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
