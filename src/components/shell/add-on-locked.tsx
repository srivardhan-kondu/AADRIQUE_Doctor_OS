import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ADD_ONS, type AddOn } from "@/lib/add-ons";

/**
 * A screen, or part of one, that belongs to an add-on the clinic has not
 * enabled. The service has already refused the data; this says what the
 * add-on does and how to get it, instead of leaving an empty page.
 *
 * `compact` is for a section inside an otherwise available screen.
 */
export function AddOnLocked({
  addOn,
  compact,
  note,
  className,
}: {
  addOn: AddOn;
  compact?: boolean;
  /** What the clinic still has without it, e.g. "Due today and overdue stay available." */
  note?: string;
  className?: string;
}) {
  const { label, description } = ADD_ONS[addOn];

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-dashed",
        compact ? "px-5 py-4" : "px-6 py-12",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-lg gap-4",
          compact ? "items-start" : "flex-col items-center text-center",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground",
            compact ? "size-9" : "size-12",
          )}
        >
          <Lock className={compact ? "size-4" : "size-5"} />
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "flex flex-wrap items-center gap-2 font-semibold",
              !compact && "justify-center text-[15px]",
              compact && "text-[14px]",
            )}
          >
            {label}
            <Badge variant="accent">Add-on</Badge>
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
          {note && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{note}</p>
          )}
          <p className="mt-3 text-[12px] font-medium">
            Contact AADRIQUE to add it to your plan.
          </p>
        </div>
      </div>
    </Card>
  );
}
