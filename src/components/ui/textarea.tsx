import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[72px] w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[14px] leading-relaxed text-foreground shadow-soft transition-colors",
        "placeholder:text-muted-foreground",
        "field-sizing-content resize-none",
        "disabled:cursor-not-allowed disabled:opacity-70",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
