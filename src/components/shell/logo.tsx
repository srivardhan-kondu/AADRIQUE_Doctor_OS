import { cn } from "@/lib/utils";

/**
 * AADRIQUE mark — a pulse tracing through a rounded square.
 * The accent stroke is the brand orange; the field carries the navy identity.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <path
        d="M5.5 16.5h4.2l2.4-6.2 3.6 12 2.9-8.1 1.8 2.3h5.9"
        stroke="currentColor"
        className="text-accent-foreground"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col leading-none", className)}>
      <span className="text-[15px] font-semibold tracking-[0.02em]">
        AADRIQUE
      </span>
      <span className="mt-1 font-display text-[12px] italic text-sidebar-muted">
        Doctor OS
      </span>
    </div>
  );
}
