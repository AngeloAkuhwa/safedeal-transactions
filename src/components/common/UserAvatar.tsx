import { cn } from "@/lib/utils";

/**
 * The one person-avatar decision.
 *
 * Not the box: call sites legitimately differ there (a 24px row avatar, a
 * 80px rounded-xl profile header, a ring that encodes risk, a wrapper that
 * already owns the size). Those stay with the caller. What this owns is the
 * decision every one of them was re-making by hand: show the photo, or show
 * initials; which initials; and what a screen reader hears.
 *
 * That decision had drifted six ways across the admin surface. A real
 * `UserAvatar` lived in `components/admin/flagged-users/`, used by its own
 * three siblings and by nobody else, because a primitive parked in a
 * feature subfolder does not get found. `EscrowRecordsTable`,
 * `AdminDisputes`, `AdminTransactionDetail` and `PayoutDetailDrawer` each
 * grew a local copy. Nine more sites inlined the ternary. Three separate
 * initials implementations disagreed about the empty-name case, rendering
 * "?", "??" or nothing at all; some fallbacks showed one letter and others
 * two; and `alt` alternated between the person's name and "" on avatars
 * that sit beside that same printed name.
 *
 * A photo next to the person's printed name is decoration, so `alt` defaults
 * to the name and callers that render the name adjacently may pass "" to
 * keep a screen reader from hearing it twice.
 */

/** Up to two initials; "?" when there is no usable name. */
export function initialsOf(name: string | null | undefined): string {
  return (
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

interface UserAvatarProps {
  url: string | null | undefined;
  name: string | null | undefined;
  /** Defaults to the name. Pass "" where the name is printed alongside. */
  alt?: string;
  /** Classes for the photo. The caller owns size, shape and ring. */
  className?: string;
  /** Classes for the initials fallback. Omit where a wrapper already styles it. */
  fallbackClassName?: string;
}

export function UserAvatar({ url, name, alt, className, fallbackClassName }: UserAvatarProps) {
  if (url) {
    return (
      <img
        src={url}
        alt={alt ?? name ?? ""}
        loading="lazy"
        decoding="async"
        className={cn(className)}
      />
    );
  }
  return <span className={cn(fallbackClassName)}>{initialsOf(name)}</span>;
}
