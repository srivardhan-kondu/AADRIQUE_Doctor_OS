import { Check, Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageBody, PageHeader } from "@/components/shell/page-header";

/**
 * A scaffolded route.
 *
 * The shell, navigation and design system are complete; these screens name
 * exactly what they will hold and which build part delivers it, so a reviewer
 * can see the full information architecture without mistaking a stub for a
 * finished feature.
 */
export function ModulePlaceholder({
  icon: Icon,
  title,
  description,
  part,
  capabilities,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  part: string;
  capabilities: string[];
}) {
  return (
    <PageBody>
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="outline">{part}</Badge>}
      />

      <Card className="overflow-hidden">
        <div className="flex items-start gap-4 border-b border-border bg-muted/40 px-5 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-soft">
            <Icon className="size-5 text-accent" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">Scaffolded route</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              This screen is wired into navigation, shortcuts and the command
              palette. Its workflow lands in {part.toLowerCase()}.
            </p>
          </div>
        </div>

        <div className="px-5 py-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            What this screen will hold
          </p>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <li key={capability} className="flex items-start gap-2.5">
                <Circle className="mt-1 size-3.5 shrink-0 text-border" strokeWidth={2.5} />
                <span className="text-[13px] leading-snug">{capability}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-muted/40 px-5 py-3">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-success">
            <Check className="size-3.5" />
            Route, navigation and shortcut
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-success">
            <Check className="size-3.5" />
            Design system and shell
          </span>
        </div>
      </Card>
    </PageBody>
  );
}
