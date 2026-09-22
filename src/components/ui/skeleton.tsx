import { cn } from "@/lib/utils";

/**
 * Spec §37: skeletons must match the real layout. Never a generic spinner on a
 * data-heavy screen.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
