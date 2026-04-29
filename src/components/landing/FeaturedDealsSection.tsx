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
      className="h-full w-full object-contain p-3 transition-transform duration-700 group-hover:scale-105"
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
      <div className="relative h-44 overflow-hidden bg-muted/40 sm:h-48 lg:h-56">
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
        <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">{product.title}</h3>
        <div className="mb-3 text-2xl font-bold text-primary">
          {formatNaira(product.price)}
        </div>
        <div className="mb-4 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {product.sellerName[0]}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">{product.sellerName}</p>
              <div className="flex items-center gap-1 text-[11px] text-warning">
                <Star className="h-3 w-3 fill-current" />
                <span className="font-semibold">{product.sellerRating}</span>
              </div>
            </div>
          </div>
        </div>
        <Button asChild className="tap-target mt-auto w-full rounded-xl text-sm font-semibold shadow-sm hover:shadow-md">
          <Link to="/marketplace">View Product</Link>
        </Button>
      </div>
    </div>
  );
}

export function FeaturedDealsSection() {
  return (
    <section id="featured-deals" className="bg-background py-10 sm:py-12 lg:py-14">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-6 text-center sm:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-semibold text-success">Featured</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">
            Featured protected deals
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Top picks from verified sellers, protected by SafeDeal escrow.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-5">
          {DEMO_PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Explore the full marketplace with thousands of protected listings
          </p>
          <Button
            asChild
            className="rounded-xl px-5 py-2.5 text-sm font-bold shadow-md hover:shadow-lg"
          >
            <Link to="/marketplace">
              Browse Full Marketplace
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
