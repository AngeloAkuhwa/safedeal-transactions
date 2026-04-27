import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { DEMO_PRODUCTS, formatNaira, type DemoProduct } from "./demo-data";

function ProductImage({ product }: { product: DemoProduct }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-success/10">
        <Shield className="h-16 w-16 text-primary/40" />
      </div>
    );
  }
  return (
    <img
      src={product.imageUrl}
      alt={product.title}
      loading="lazy"
      onError={() => setErrored(true)}
      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
    />
  );
}

function ProductCard({ product }: { product: DemoProduct }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-muted/40">
        <ProductImage product={product} />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-success px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success-foreground shadow-md">
          <Shield className="h-3 w-3" />
          Protected
        </span>
        <span className="absolute bottom-3 left-3 rounded-lg bg-background/95 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur">
          In Stock
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="mb-1.5 text-lg font-bold text-foreground sm:text-xl">{product.title}</h3>
        <div className="mb-4 text-2xl font-bold text-primary sm:text-3xl">
          {formatNaira(product.price)}
        </div>
        <div className="mb-5 flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {product.sellerName[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{product.sellerName}</p>
              <div className="flex items-center gap-1 text-xs text-warning">
                <Star className="h-3 w-3 fill-current" />
                <span className="font-semibold">{product.sellerRating}</span>
              </div>
            </div>
          </div>
        </div>
        <Button asChild className="mt-auto w-full">
          <Link to="/marketplace">View Product</Link>
        </Button>
      </div>
    </div>
  );
}

export function FeaturedDealsSection() {
  return (
    <section id="featured-deals" className="bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-success/10 px-4 py-1.5">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-semibold text-success">Featured</span>
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Featured protected deals
          </h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">
            Top picks from verified sellers, protected by SafeDeal escrow.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="mb-4 text-sm text-muted-foreground sm:text-base">
            Explore the full marketplace with thousands of protected listings
          </p>
          <Button asChild size="lg" className="gap-2">
            <Link to="/marketplace">
              Browse Full Marketplace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
