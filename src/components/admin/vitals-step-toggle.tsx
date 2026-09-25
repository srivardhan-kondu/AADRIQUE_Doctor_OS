"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setVitalsStepAction } from "@/app/(dashboard)/admin/actions";

/** Spec §12 — a clinic decides whether vitals come before the doctor. */
export function VitalsStepToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant={enabled ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setVitalsStepAction(!enabled);
          if (result.ok) {
            toast.success(result.message, { description: result.action });
            router.refresh();
          } else {
            toast.error(result.message ?? "That could not be changed.", {
              description: result.action,
            });
          }
        })
      }
    >
      {pending && <LoaderCircle className="animate-spin" />}
      {enabled ? "Turn off" : "Turn on"}
    </Button>
  );
}
