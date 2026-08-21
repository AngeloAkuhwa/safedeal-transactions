import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        // Every size guarantees a 44px height; only this one could not
        // guarantee a width. `px-3` around a 16px icon is 40px, so a `sm`
        // button whose label is hidden on mobile. `<span class="hidden
        // sm:inline">Refresh</span>` is the exact shape: passes the height
        // half of WCAG 2.5.5 and fails the width half. `default` (px-4) and
        // `lg` (px-8) already clear 44px, and `icon` is explicitly 44x44.
        //
        // The floor lives on the size and not on the base, deliberately:
        // `buttonVariants()` is consumed directly by calendar.tsx, where
        // `min-width` would beat the `w-9` on a day cell and stretch every
        // square in the grid.
        sm: "h-11 min-w-11 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        // `w-11` is a *width*, and a flex item will shrink below its width on
        // demand: this one was squeezed to 18px in the product-preview header
        // while still reporting `w-11`. pagination.tsx had already hit this and
        // patched around it locally with `min-h-11 min-w-11`; the floor belongs
        // here instead.
        icon: "h-11 w-11 min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
