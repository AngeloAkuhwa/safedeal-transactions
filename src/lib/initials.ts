/**
 * Up to two initials for a person's name; "?" when there is no usable name.
 *
 * One rule, because the admin surface had three and they disagreed about
 * exactly the case that shows up in real data: a missing name rendered
 * "?", "??" or an empty circle depending on which copy you hit.
 */
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
