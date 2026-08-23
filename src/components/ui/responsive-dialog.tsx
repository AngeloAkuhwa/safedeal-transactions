import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useViewport } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /**
   * Required, even when it duplicates the title. Radix warns without one and,
   * more usefully, a dialog that opens with no explanation of why is the most
   * common modal defect there is.
   */
  description: React.ReactNode;
  children?: React.ReactNode;
  /** Actions. Stacked full width in the sheet, right-aligned in the dialog. */
  footer?: React.ReactNode;
  /**
   * Extra classes for the content surface in both presentations.
   *
   * Sizing classes must be qualified `md:` or above. The dialog is centred by
   * a translate, so narrowing it is harmless; the sheet is `inset-x-0`, so a
   * bare `max-w-md` leaves a 448px panel against the left edge of the phone.
   * `sm:` is 640px and this component swaps at 768, so `sm:` is the wrong
   * prefix even though it is the reflex one. Enforced by
   * `src/__tests__/responsive-dialog-width.contract.test.ts`.
   */
  className?: string;
}

/**
 * A dialog on a desktop, a bottom sheet on a phone.
 *
 * The working agreement asks for "sheets and drawers rather than centred
 * desktop style modals" on phone widths. There are 25 centred `DialogContent`
 * on customer screens and three sheets, and `drawer.tsx` has been sitting in
 * `components/ui` since the shadcn install, imported by nothing.
 *
 * A centred modal on a phone is wrong in a specific way rather than just
 * unfashionable: it lands in the middle of the screen, so its actions sit
 * around the vertical centre, which is the part of a phone a thumb reaches
 * last. A sheet puts them at the bottom, where the thumb already is, and it
 * arrives from the edge it will leave by.
 *
 * ## Why this waits before it renders
 *
 * Choosing between two components on viewport is not the same as choosing
 * between two classNames, and the hook this used to reach for made them look
 * the same. `useIsMobile` returns `!!undefined` before its effect runs, so on
 * a phone the first paint says desktop. For a className that is a flicker. For
 * a component swap it is an unmount and remount: an open dialog blinks, and
 * anything the children were holding, a half-typed form most of all, is gone.
 *
 * So this reads the three-state `useViewport` and renders nothing while the
 * answer is unknown. That costs one frame on first mount and only when the
 * dialog is already open, which is rare, and it buys a component that never
 * swaps itself out from under its own children.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ResponsiveDialogProps) {
  const isMobile = useViewport();

  // Undecided. Rendering either one now means remounting the other in a frame.
  if (isMobile === undefined) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {/* max-h in dvh, not vh: on iOS a sheet sized in vh puts its footer
            below the bottom of the screen while the address bar is showing. */}
        <DrawerContent className={cn("max-h-[92dvh]", className)}>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          {/* The body scrolls, the header and footer stay put, which is the
              behaviour that makes a sheet feel native rather than like a page. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">{children}</div>
          {footer && <DrawerFooter className="pt-4">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[85dvh] overflow-y-auto", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
