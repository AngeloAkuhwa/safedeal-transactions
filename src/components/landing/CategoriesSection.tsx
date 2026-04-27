import { Link } from "react-router-dom";
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
  desc: string;
  count: string;
  icon: LucideIcon;
  tone: Tone;
}

const categories: Category[] = [
  {
    slug: "phones-tablets",
    name: "Phones & Tablets",
    desc: "Latest smartphones and tablets",
    count: "2,847 active listings",
    icon: Smartphone,
    tone: "primary",
  },
  {
    slug: "computing",
    name: "Laptops",
    desc: "MacBooks and PCs",
    count: "1,523 active listings",
    icon: Laptop,
    tone: "success",
  },
  {
    slug: "fashion",
    name: "Fashion & Sneakers",
    desc: "Clothing, shoes and accessories",
    count: "3,142 active listings",
    icon: Shirt,
    tone: "warning",
  },
  {
    slug: "electronics",
    name: "Electronics",
    desc: "Audio, cameras and gadgets",
    count: "1,967 active listings",
    icon: Headphones,
    tone: "primary",
  },
  {
    slug: "home",
    name: "Home & Living",
    desc: "Furniture and home essentials",
    count: "892 active listings",
    icon: Sofa,
    tone: "success",
  },
  {
    slug: "gaming",
    name: "Gaming",
    desc: "Consoles, games and accessories",
    count: "1,234 active listings",
    icon: Gamepad2,
    tone: "danger",
  },
  {
    slug: "beauty",
    name: "Beauty & Accessories",
    desc: "Cosmetics and personal care",
    count: "2,156 active listings",
    icon: SprayCan,
    tone: "warning",
  },
  {
    slug: "services",
    name: "Services",
    desc: "Professional services and repairs",
    count: "567 active listings",
    icon: Wrench,
    tone: "primary",
  },
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

function CategoryCard({ cat }: { cat: Category }) {
  const ref = useScrollReveal<HTMLAnchorElement>();
  const t = toneMap[cat.tone];
  return (
    <Link
      ref={ref}
      to={`/marketplace?category=${cat.slug}`}
      className="group rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg sm:p-6"
    >
      <div className="mb-4 flex items-start justify-between">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${t.wrap} ${t.hover}`}
        >
          <cat.icon className={`h-6 w-6 transition-colors ${t.icon} group-hover:text-current`} />
        </div>
        <ArrowRight
          className={`h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 ${t.arrow}`}
        />
      </div>
      <h3 className="mb-1.5 text-base font-bold text-foreground sm:text-lg">{cat.name}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{cat.desc}</p>
      <p className="text-xs font-semibold text-muted-foreground">{cat.count}</p>
    </Link>
  );
}

export function CategoriesSection() {
  return (
    <section id="categories" className="bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5">
            <Grid2x2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Browse Categories</span>
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Shop by category
          </h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">
            Find protected deals across popular categories.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <CategoryCard key={c.slug} cat={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
