import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The total and the action, pinned, on one line.
 *
 * On a phone the payment summary is several screens of scrolling above the
 * button that acts on it, so the buyer commits to a number they can no longer
 * see. Worse, on the review screen the total was rendered *after* the pay
 * button in document order — on desktop the sidebar hid that, on mobile it
 * meant the price genuinely appeared below the thing you press.
 *
 * So the total travels with the action. Two rules hold this together and both
 * are load-bearing:
 *
 *   - the total sits BEFORE the button in DOM order, and beside it visually,
 *     so it is never below the button in any layout or at any text size;
 *   - the bar is mobile-only. Above `lg` the summary sidebar is already
 *     sticky and visible, and a second fixed bar would just cover content.
 *
 * `MobileTabBar` is also fixed to the bottom on `/dashboard/*` routes, so
 * `aboveTabBar` lifts this clear of it rather than the two stacking on top of
 * each other. Both reserve their own spacer, so neither can hide page content.
 */
export interface StickyPayBarProps {
  /** Preformatted — this component must never guess at currency. */
  total: string;
  totalLabel?: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  /** Shown in place of the button when there is nothing to press yet. */
  note?: ReactNode;
  /** Set on routes that also render the fixed MobileTabBar. */
  aboveTabBar?: boolean;
}

export function StickyPayBar({
  total,
  totalLabel = "Total",
  actionLabel,
  onAction,
  disabled = false,
  note,
  aboveTabBar = false,
}: StickyPayBarProps) {
  return (
    <>
      {/* Spacer: the bar is fixed, so without this it sits over the last card. */}
      <div
        aria-hidden
        className="lg:hidden"
        style={{ height: `calc(76px + ${aboveTabBar ? "56px + " : ""}env(safe-area-inset-bottom))` }}
      />
      <div
        className={cn(
          "fixed inset-x-0 z-sticky border-t border-border bg-card/95 backdrop-blur-lg lg:hidden",
          aboveTabBar ? "bottom-14" : "bottom-0",
        )}
        style={aboveTabBar ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3">
          {/* Order is deliberate: total first, action second. */}
          <div className="min-w-0">
            <p className="text-xs leading-none text-muted-foreground">{totalLabel}</p>
            <p className="mt-1 truncate text-lg font-bold leading-tight text-foreground">{total}</p>
          </div>
          {note ? (
            <div className="ms-auto min-w-0 text-right text-xs text-muted-foreground">{note}</div>
          ) : (
            <Button
              onClick={onAction}
              disabled={disabled}
              size="lg"
              className="ms-auto min-h-11 shrink-0 rounded-xl font-bold"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
