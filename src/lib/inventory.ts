/**
 * Inventory math + presentation helpers.
 *
 * Single source of truth for "how many units can a buyer actually buy right now".
 * Mirrors the server-side rule: available = max(0, stock_quantity - reserved_quantity).
 */

export interface StockShape {
  stock_quantity?: number | null;
  reserved_quantity?: number | null;
}

export function getAvailableQuantity(p: StockShape | null | undefined): number {
  if (!p) return 0;
  const stock = Number(p.stock_quantity ?? 0);
  const reserved = Number(p.reserved_quantity ?? 0);
  return Math.max(0, stock - reserved);
}

export function isOutOfStock(p: StockShape | null | undefined): boolean {
  return getAvailableQuantity(p) <= 0;
}

/**
 * The single low-stock threshold for the whole app. Cart, checkout review and
 * listing badges must all use this. Inventing per-screen numbers (3 here, 5
 * there) told the same buyer two different stories about the same product.
 */
export const LOW_STOCK_THRESHOLD = 5;

export function isLowStock(p: StockShape | null | undefined): boolean {
  const a = getAvailableQuantity(p);
  return a >= 1 && a <= LOW_STOCK_THRESHOLD;
}

export type StockTone = "out" | "low" | "ok";

export interface StockBadge {
  label: string;
  tone: StockTone;
  available: number;
  reserved: number;
}

export function getStockBadge(p: StockShape | null | undefined): StockBadge {
  const available = getAvailableQuantity(p);
  const reserved = Number(p?.reserved_quantity ?? 0);
  if (available <= 0) return { label: "Out of Stock", tone: "out", available, reserved };
  if (available <= LOW_STOCK_THRESHOLD) return { label: `Only ${available} left`, tone: "low", available, reserved };
  return { label: "In Stock", tone: "ok", available, reserved };
}
