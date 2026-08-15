import type { KeyboardEvent } from "react";

/**
 * Keyboard activation for elements that carry an `onClick` but are not natively
 * focusable (rows, cards, list items). Pair with `role` + `tabIndex={0}`.
 * Events bubbling up from nested controls are ignored so a button inside the
 * row is not double-fired.
 */
export function keyActivate(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  if (event.target !== event.currentTarget) return;
  event.preventDefault();
  event.currentTarget.click();
}
