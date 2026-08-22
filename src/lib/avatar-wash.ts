/**
 * A stable tint for an avatar with no image.
 *
 * Two copies of this existed and they disagreed on both halves. The marketplace
 * card hashed the seller's name into five gradients (`from-emerald-500
 * to-teal-400`, `from-violet-500 to-purple-400`, and so on) with `text-white`
 * over them: ten raw colours, four of them accents this product does not have.
 * The cart keyed off the row index instead, so the same seller was one colour
 * in the marketplace and another in the cart, and a different colour again
 * after anything reordered the list.
 *
 * Hashing the name is the right key: it is stable per seller, across screens
 * and across reorderings. Only the palette needed replacing, and the washes
 * below are all inside the token system.
 *
 * These are decoration, never meaning. The seller's name is printed next to
 * the avatar in every place this is used.
 */
const WASHES = [
  "bg-primary/15 text-primary",
  "bg-muted text-foreground",
  "bg-primary/25 text-primary",
  "bg-muted-foreground/15 text-foreground",
  "bg-primary/10 text-primary",
];

export function avatarWash(name: string | null | undefined): string {
  const key = (name ?? "").trim();
  if (!key) return WASHES[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return WASHES[Math.abs(hash) % WASHES.length];
}
