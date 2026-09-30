"use client";

import { cn, greeting } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";

/**
 * The greeting at the top of the doctor's day: who they are, today's date and
 * whether patients see them as on duty.
 *
 * Rendered after mount: the greeting and date depend on the viewer's clock
 * and timezone, which the server cannot know without guessing.
 */
export function DayGreeting({
  name,
  details,
  online,
}: {
  name: string;
  /** Specialisation, qualifications, department, room — whichever are set. */
  details: string[];
  online: boolean;
}) {
  const mounted = useMounted();
  const now = mounted ? new Date() : null;

  return (
    <div className="min-w-0">
      {now ? (
        <p className="font-display text-[26px] font-normal leading-tight tracking-[-0.01em] text-foreground sm:text-[30px]">
          {greeting(now)}, {name.replace(/^Dr\.\s*/, "Dr. ")}
        </p>
      ) : (
        <Skeleton className="h-8 w-72 max-w-full" />
      )}

      {details.length > 0 && (
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {details.join(" · ")}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] font-medium text-foreground">
        {now ? (
          <span data-numeric className="whitespace-nowrap">
            {now.toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        ) : (
          <Skeleton className="h-5 w-56" />
        )}
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span
            className={cn(
              "size-2 rounded-full",
              online ? "bg-success" : "bg-muted-foreground",
            )}
          />
          {online ? "Online" : "Away"}
        </span>
      </div>
    </div>
  );
}
