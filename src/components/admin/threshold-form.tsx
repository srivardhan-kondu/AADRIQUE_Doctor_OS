"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateThresholdsAction } from "@/app/(dashboard)/admin/actions";

/**
 * Spec §17 — the numbers the operational pulse is measured against.
 *
 * Editable because they are a clinic's policy, not the product's opinion: a
 * paediatric clinic and an orthopaedic one do not agree on what a long wait is.
 */
export function ThresholdForm({
  departmentId,
  waitThresholdMinutes,
  queueCapacity,
}: {
  departmentId: string;
  waitThresholdMinutes: number;
  queueCapacity: number;
}) {
  const router = useRouter();
  const [wait, setWait] = React.useState(String(waitThresholdMinutes));
  const [capacity, setCapacity] = React.useState(String(queueCapacity));
  const [pending, startTransition] = React.useTransition();

  const changed =
    Number(wait) !== waitThresholdMinutes ||
    Number(capacity) !== queueCapacity;

  const valid =
    Number.isFinite(Number(wait)) &&
    Number(wait) >= 5 &&
    Number(wait) <= 180 &&
    Number.isFinite(Number(capacity)) &&
    Number(capacity) >= 1 &&
    Number(capacity) <= 100;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label
          htmlFor={`wait-${departmentId}`}
          className="text-[11px] font-semibold text-muted-foreground"
        >
          Wait threshold
        </label>
        <div className="mt-1 flex items-center gap-1.5">
          <Input
            id={`wait-${departmentId}`}
            type="number"
            min={5}
            max={180}
            value={wait}
            onChange={(e) => setWait(e.target.value)}
            className="h-8 w-20 tabular"
          />
          <span className="text-[12px] text-muted-foreground">min</span>
        </div>
      </div>

      <div>
        <label
          htmlFor={`capacity-${departmentId}`}
          className="text-[11px] font-semibold text-muted-foreground"
        >
          Queue capacity
        </label>
        <Input
          id={`capacity-${departmentId}`}
          type="number"
          min={1}
          max={100}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="mt-1 h-8 w-20 tabular"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={pending || !changed || !valid}
        onClick={() =>
          startTransition(async () => {
            const result = await updateThresholdsAction(departmentId, {
              waitThresholdMinutes: Number(wait),
              queueCapacity: Number(capacity),
            });

            if (result.ok) {
              toast.success(result.message ?? "Saved.", {
                description: result.action,
              });
              router.refresh();
            } else {
              toast.error(result.message ?? "That did not save.", {
                description: result.action,
              });
            }
          })
        }
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
        Save
      </Button>
    </div>
  );
}
