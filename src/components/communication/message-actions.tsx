"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryMessageAction } from "@/app/(dashboard)/doctor/messages/actions";

/** Spec §38 — a failure offers the next step rather than ending the road. */
export function RetryButton({
  messageId,
  attemptCount,
}: {
  messageId: string;
  attemptCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const exhausted = attemptCount >= 3;

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending || exhausted}
      title={
        exhausted
          ? "Tried three times already — check the patient's contact details."
          : undefined
      }
      onClick={() =>
        startTransition(async () => {
          const result = await retryMessageAction(messageId);
          if (result.ok) {
            toast.success(result.message ?? "Sent.");
            router.refresh();
          } else {
            toast.error(result.message ?? "It failed again.", {
              description: result.action,
            });
          }
        })
      }
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
      {exhausted ? "Gave up" : "Retry"}
    </Button>
  );
}
