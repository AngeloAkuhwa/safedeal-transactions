import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BackLinkProps {
  /** Where back goes. A real destination, not history. See the note below. */
  to: string;
  /**
   * What the destination is, in the user's words: "Back to disputes".
   *
   * Required, and required as a prop rather than as optional decoration,
   * because the shape this replaces made it optional in practice and half the
   * app skipped it. `SellerProductDetail` rendered
   * `<Button variant="ghost" size="icon">` around a bare arrow with no label
   * at all, so a screen reader announced "button" and nothing else. Making it
   * part of the type means TypeScript refuses to compile the unlabelled
   * version, which is the only way this stays true across 49 call sites.
   */
  label: string;
  /** Show the label beside the arrow. Icon-only by default, always labelled. */
  showLabel?: boolean;
  className?: string;
}

/**
 * The one way back.
 *
 * 49 files hand-rolled this, and they disagreed on every axis that matters:
 *
 *   - whether it had an accessible name at all;
 *   - `<Button variant="ghost" size="icon">` in some places, a raw `<button>`
 *     with hand-written hover and focus classes in others;
 *   - `rounded-xl` here, `rounded-md` there;
 *   - whether the 44px target was expressed, inherited, or simply absent.
 *
 * A `Link` rather than a `button` calling `navigate()`, which is what most of
 * them did. A link has an href: it can be middle-clicked, opened in a new tab
 * and copied, a screen reader announces it as a link to somewhere rather than
 * as an unnamed control, and the browser's own affordances work. `navigate()`
 * throws all of that away to do the same thing.
 *
 * `to` is a destination, deliberately, rather than a `navigate(-1)` history
 * pop. History is not a place: a user who arrived from a share link, a
 * notification or a refresh has nothing behind them, and "back" then means
 * leaving the app entirely. Naming the parent surface is always correct and
 * never surprising.
 */
export function BackLink({ to, label, showLabel = false, className }: BackLinkProps) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      {showLabel && <span className="truncate text-sm font-medium">{label}</span>}
    </Link>
  );
}
