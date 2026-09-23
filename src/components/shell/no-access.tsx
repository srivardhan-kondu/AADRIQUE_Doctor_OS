import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/components/shell/page-header";

/**
 * Spec §21 + §38 — what a screen looks like when the actor may not see it.
 *
 * The permission check that matters happens on the server before any data is
 * read; this is only how the refusal is shown. It says which screen was
 * refused and who can grant it, rather than dropping the user on an error.
 */
export function NoAccess({
  title,
  what,
  backHref = "/doctor",
  backLabel = "Back to your workspace",
}: {
  title: string;
  /** Named in the sentence: "…to see the audit log." */
  what: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <PageBody>
      <PageHeader title={title} />
      <Card className="border-dashed">
        <EmptyState
          icon={Lock}
          title="This screen is not part of your role"
          description={`Your account does not have permission ${what}. A hospital administrator can change that in role settings.`}
          action={
            <Button asChild variant="outline">
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          }
        />
      </Card>
    </PageBody>
  );
}
