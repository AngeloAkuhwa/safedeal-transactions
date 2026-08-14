import { Link } from "react-router";
import {
  Smartphone,
  Laptop,
  Shirt,
  Headphones,
  Sofa,
  Gamepad2,
  SprayCan,
  Wrench,
  ArrowRight,
  Grid2x2,
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success" | "warning" | "danger";

interface Category {
  slug: string;
  name: string;
  icon: LucideIcon;
  tone: Tone;
}

const categories: Category[] = [
  { slug: "phones-tablets", name: "Phones & Tablets", icon: Smartphone, tone: "primary" },
  { slug: "computing", name: "Laptops", icon: Laptop, tone: "success" },
  { slug: "fashion", name: "Fashion & Sneakers", icon: Shirt, tone: "warning" },
  { slug: "electronics", name: "Electronics", icon: Headphones, tone: "primary" },
  { slug: "home", name: "Home & Living", icon: Sofa, tone: "success" },
  { slug: "gaming", name: "Gaming", icon: Gamepad2, tone: "danger" },
  { slug: "beauty", name: "Beauty & Accessories", icon: SprayCan, tone: "warning" },
  { slug: "services", name: "Services", icon: Wrench, tone: "primary" },
];

const toneMap: Record<Tone, { wrap: string; icon: string; hover: string; arrow: string }> = {
  primary: {
    wrap: "bg-primary/10",
    icon: "text-primary",
    hover: "group-hover:bg-primary group-hover:text-primary-foreground",
    arrow: "group-hover:text-primary",
  },
  success: {
    wrap: "bg-success/10",
    icon: "text-success",
    hover: "group-hover:bg-success group-hover:text-success-foreground",
    arrow: "group-hover:text-success",
  },
  warning: {
    wrap: "bg-warning/10",
    icon: "text-warning",
    hover: "group-hover:bg-warning group-hover:text-warning-foreground",
    arrow: "group-hover:text-warning",
  },
  danger: {
    wrap: "bg-destructive/10",
    icon: "text-destructive",
    hover: "group-hover:bg-destructive group-hover:text-destructive-foreground",
    arrow: "group-hover:text-destructive",
  },
};

function CategoryCard({ cat, index }: { cat: Category; index: number }) {
  const ref = useScrollReveal<HTMLAnchorElement>();
  const t = toneMap[cat.tone];
  return (
    <Link
      ref={ref}
      to={`/marketplace?category=${cat.slug}`}
      style={{ transitionDelay: `${index * 50}ms` }}
      className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-110 ${t.wrap} ${t.hover}`}
      >
        <cat.icon className={`h-5 w-5 transition-colors ${t.icon} group-hover:text-current`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-bold text-foreground">
            {cat.name}
          </h3>
          <ArrowRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-all duration-300 group-hover:translate-x-1 ${t.arrow}`}
          />
        </div>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Protected deals</p>
      </div>
    </Link>
  );
}

export function CategoriesSection() {
  return (
    <section id="categories" className="bg-muted/30 py-10 sm:py-12">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-6 text-center sm:mb-8">
          <h2 className="h-section mb-2 font-bold text-foreground">Shop by category</h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Find protected deals across popular categories.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-4">
          {categories.map((c, i) => (
            <CategoryCard key={c.slug} cat={c} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
