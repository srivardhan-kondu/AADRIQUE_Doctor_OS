import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/server/services/dashboard";

/**
 * Spec §5.1 — the signature Patient Flow visualisation.
 *
 * Registered → Waiting → Vitals → With Doctor → Completed → Follow-up, with
 * the live count at each stage.
 */

const STAGES = [
  { key: "WAITING", label: "Waiting", dot: "bg-state-waiting" },
  { key: "VITALS", label: "Vitals", dot: "bg-state-vitals" },
  { key: "WITH_DOCTOR", label: "With Doctor", dot: "bg-state-with-doctor" },
  { key: "COMPLETED", label: "Completed", dot: "bg-state-completed" },
  { key: "FOLLOW_UP", label: "Follow-up", dot: "bg-state-followup" },
] as const;

export function PatientFlow({ flow }: { flow: DashboardData["flow"] }) {
  const total = Math.max(1, ...STAGES.map((s) => flow[s.key]));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Patient Flow</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Where today&apos;s patients are right now
          </p>
        </div>
      </CardHeader>

      <div className="px-5 pb-5">
        <ol className="flex items-stretch gap-1.5">
          {STAGES.map((stage, index) => {
            const count = flow[stage.key];
            const share = count / total;

            return (
              <li key={stage.key} className="flex min-w-0 flex-1 items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn("size-1.5 shrink-0 rounded-full", stage.dot)} />
                    <span
                      data-numeric
                      className={cn(
                        "font-display text-xl font-medium leading-none",
                        count === 0 && "text-muted-foreground/50",
                      )}
                    >
                      {count}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-[11px] font-medium text-muted-foreground">
                    {stage.label}
                  </p>
                  {/* A proportional bar reads faster than the number alone. */}
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", stage.dot)}
                      style={{ width: `${Math.max(share * 100, count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                </div>
                {index < STAGES.length - 1 && (
                  <ArrowRight
                    aria-hidden
                    className="mb-5 size-3.5 shrink-0 text-border"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
