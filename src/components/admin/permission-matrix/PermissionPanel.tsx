import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared shell for every section on the Permission Matrix screen.
 * Rounded card, subtle border, backdrop blur, no internal divider lines.
 * Spacing (not rules) separates header from body and card from card.
 */
export function PermissionPanel({
  icon,
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  headerClassName,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}) {
  const hasHeader = Boolean(icon || title || subtitle || actions);
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm md:p-6",
        className,
      )}
    >
      {hasHeader && (
        <header className={cn("flex flex-wrap items-start gap-3", headerClassName)}>
          {icon && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title && <div className="text-base font-semibold text-foreground">{title}</div>}
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children != null && (
        <div className={cn(hasHeader ? "mt-4" : undefined, bodyClassName)}>{children}</div>
      )}
    </section>
  );
}