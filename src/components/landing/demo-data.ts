/**
 * Demo data for the landing page (frontend only).
 * Used to render featured products and verified seller cards reliably,
 * regardless of backend state.
 */

export interface DemoProduct {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  sellerName: string;
  sellerRating: number;
  sellerSlug: string;
  inStock: boolean;
}

export interface DemoSeller {
  id: string;
  name: string;
  slug: string;
  bannerGradient: string; // tailwind classes
  initials: string;
  initialsGradient: string;
  rating: number;
  completed: number;
  products: number;
  location: string;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "iphone-15-pro-max",
    title: "iPhone 15 Pro Max 256GB",
    price: 1_850_000,
    imageUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/4c11c679c5-c33fb6e0c57e13f11e1e.png",
    sellerName: "TechHub Lagos",
    sellerRating: 4.9,
    sellerSlug: "techhub-lagos",
    inStock: true,
  },
  {
    id: "macbook-pro-16-m3",
    title: "MacBook Pro 16-inch M3",
    price: 3_200_000,
    imageUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/ad3616dfae-0180e04d9d7119b94a58.png",
    sellerName: "Premium Tech NG",
    sellerRating: 4.8,
    sellerSlug: "premium-tech-ng",
    inStock: true,
  },
  {
    id: "nike-air-max-90",
    title: "Nike Air Max 90",
    price: 185_000,
    imageUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/40b2674a3c-c500db258b72d6a23595.png",
    sellerName: "SneakerHub",
    sellerRating: 4.7,
    sellerSlug: "sneakerhub",
    inStock: true,
  },
];

export const DEMO_SELLERS: DemoSeller[] = [
  {
    id: "chioma-electronics",
    name: "Chioma Electronics",
    slug: "chioma-electronics",
    bannerGradient: "from-primary to-blue-400",
    initials: "CE",
    initialsGradient: "from-primary to-blue-500",
    rating: 4.9,
    completed: 1832,
    products: 247,
    location: "Lagos",
  },
  {
    id: "techhub-lagos",
    name: "TechHub Lagos",
    slug: "techhub-lagos",
    bannerGradient: "from-success to-emerald-400",
    initials: "TH",
    initialsGradient: "from-emerald-500 to-teal-500",
    rating: 4.9,
    completed: 3456,
    products: 1203,
    location: "Lagos",
  },
  {
    id: "gamezone-nigeria",
    name: "GameZone Nigeria",
    slug: "gamezone-nigeria",
    bannerGradient: "from-warning to-orange-400",
    initials: "GZ",
    initialsGradient: "from-orange-500 to-amber-500",
    rating: 4.8,
    completed: 2145,
    products: 892,
    location: "Lagos",
  },
  {
    id: "styleplug-lagos",
    name: "StylePlug Lagos",
    slug: "styleplug-lagos",
    bannerGradient: "from-violet-500 to-purple-400",
    initials: "SP",
    initialsGradient: "from-violet-500 to-purple-500",
    rating: 4.7,
    completed: 4823,
    products: 1567,
    location: "Lagos",
  },
];

import { formatMoney } from "@/lib/format";

/**
 * Landing-page demo helper. Routes through the shared `formatMoney` so the
 * marketing surfaces match the production 2-decimal money rule.
 */
export function formatNaira(value: number): string {
  return formatMoney(value, "NGN");
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-NG").format(value);
}
