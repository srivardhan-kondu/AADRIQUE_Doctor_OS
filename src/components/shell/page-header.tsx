import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent page framing. Every screen gets the same title rhythm and gutter
 * so the product reads as one system rather than a set of modules.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 pb-7",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-[32px] font-normal leading-[1.1]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {/* Wraps rather than widening the page: on a phone, three header
          buttons are wider than the screen (spec §34). */}
      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/** The standard content gutter for a screen inside the shell. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1400px] px-4 pb-10 pt-4 lg:px-8", className)}>
      {children}
    </div>
  );
}
