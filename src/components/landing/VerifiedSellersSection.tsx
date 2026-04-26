import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Shield, Store, CheckCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMarketplaceProducts } from "@/services/marketplace.service";

const avatarColors = [
  "from-primary to-blue-400",
  "from-emerald-500 to-teal-400",
  "from-violet-500 to-purple-400",
  "from-orange-500 to-amber-400",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function VerifiedSellersSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace-featured-sellers"],
    queryFn: () => getMarketplaceProducts({ sort: "newest", page: 1, include: "sellers" }),
    staleTime: 5 * 60_000,
  });

  const sellers = (data?.featured_sellers ?? []).slice(0, 4);

  return (
    <section className="bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-success/10 px-4 py-1.5">
            <Store className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-semibold text-success">Trusted Sellers</span>
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Shop from verified sellers
          </h2>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            Every seller passes email, phone, and identity verification before going live on SafeDeal.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-72 rounded-xl border bg-card/60 animate-pulse" />
            ))}
          </div>
        ) : sellers.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            New verified sellers are joining SafeDeal — check back soon.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {sellers.map((seller) => {
              const initial = (seller.full_name || "S")[0].toUpperCase();
              const isTrusted = seller.verification_level === "trusted_buyer";
              const location =
                seller.city_name || seller.state_name
                  ? [seller.city_name, seller.state_name].filter(Boolean).join(", ")
                  : "Lagos";
              return (
                <div
                  key={seller.id}
                  className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="h-24 bg-gradient-to-br from-primary to-primary/70" />
                  <div className="-mt-10 px-5 pb-5">
                    <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-card bg-card shadow-md">
                      {seller.avatar_url ? (
                        <img
                          src={seller.avatar_url}
                          alt={seller.full_name}
                          className="h-full w-full rounded-xl object-cover"
                        />
                      ) : (
                        <div
                          className={`flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br text-xl font-bold text-primary-foreground ${getAvatarColor(seller.full_name)}`}
                        >
                          {initial}
                        </div>
                      )}
                    </div>

                    <div className="mb-3 text-center">
                      <div className="mb-2 flex items-center justify-center gap-1.5">
                        <h3 className="text-base font-bold text-foreground">{seller.full_name}</h3>
                        {seller.email_verified && (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                        <Shield className="h-3 w-3" />
                        {isTrusted ? "Trusted Seller" : "Verified Seller"}
                      </span>
                    </div>

                    <div className="mb-4 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Products</span>
                        <span className="font-semibold text-foreground">{seller.product_count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Location</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {location}
                        </span>
                      </div>
                    </div>

                    <Button asChild className="w-full" size="sm">
                      <Link to={`/store/${seller.store_slug}`}>View Store</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}