/**
 * Sachet catalogue: one-off purchases, priced server-side ONLY.
 *
 * Both `vendor-plan` (which charges) and `public-pricing` (which discloses)
 * read from here so the price a buyer is shown and the price charged can
 * never drift apart.
 */
export const SACHETS = {
  photo_slots: { amount_naira: 1000, slots: 10, label: "+10 showcase slots" },
  store_boost: { amount_naira: 1500, days: 7, label: "Boost my store" },
} as const;
