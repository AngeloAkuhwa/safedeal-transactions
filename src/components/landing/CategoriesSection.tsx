import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Smartphone,
  Laptop,
  Shirt,
  Tv,
  Home,
  Sparkles,
  Dumbbell,
  Boxes,
  ArrowRight,
  Grid2x2,
  type LucideIcon,
} from "lucide-react";
import { getMarketplaceProducts } from "@/services/marketplace.service";

const ICONS: Record<string, LucideIcon> = {
  electronics: Tv,
  "phones-tablets": Smartphone,
  phones: Smartphone,
  computing: Laptop,
  laptops: Laptop,
  fashion: Shirt,
  home: Home,
  beauty: Sparkles,
  sports: Dumbbell,
  other: Boxes,
};

function pickIcon(slug: string): LucideIcon {
  const key = slug.toLowerCase();
  if (ICONS[key]) return ICONS[key];
  for (const k of Object.keys(ICONS)) {
    if (key.includes(k)) return ICONS[k];
  }
  return Boxes;
}

const DESCRIPTIONS: Record<string, string> = {
  electronics: "Headphones, cameras, and gadgets",
  "phones-tablets": "Latest smartphones, tablets, and accessories",
  phones: "Latest smartphones, tablets, and accessories",
  computing: "MacBooks, PCs, and computing devices",
  fashion: "Clothing, shoes, and fashion accessories",
  home: "Furniture, appliances, and home decor",
  beauty: "Skincare, makeup, and personal care",
  sports: "Equipment, apparel, and outdoor gear",
  other: "Everything else worth protecting",
};

export function CategoriesSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace-categories-preview"],
    queryFn: () => getMarketplaceProducts({ sort: "newest", page: 1 }),
    staleTime: 5 * 60_000,
  });

  const categories = (data?.categories ?? []).slice(0, 8);

  return (
    <section className="bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5">
            <Grid2x2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Browse Categories</span>
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Shop by category
          </h2>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            Explore protected deals across all categories. Every listing is backed by SafeDeal escrow.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-44 rounded-xl border bg-card/60 animate-pulse"
              />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Categories will appear here as sellers list more products.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((cat) => {
              const Icon = pickIcon(cat.slug);
              const description =
                DESCRIPTIONS[cat.slug.toLowerCase()] || `Explore ${cat.name.toLowerCase()} listings`;
              return (
                <Link
                  key={cat.id}
                  to={`/marketplace?category=${cat.id}`}
                  className="group rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-6 w-6 text-primary transition-colors group-hover:text-primary-foreground" />
                  </div>
                  <h3 className="mb-1.5 text-base font-bold text-foreground">{cat.name}</h3>
                  <p className="mb-4 text-sm text-muted-foreground">{description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {cat.product_count} protected {cat.product_count === 1 ? "listing" : "listings"}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}