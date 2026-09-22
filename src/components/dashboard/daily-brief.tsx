import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/server/services/dashboard";

/**
 * Spec §18 — the Doctor Daily Brief, with Start My Day.
 *
 * "Start My Day" goes straight to the next actual task: the patient currently
 * with the doctor if there is one, otherwise the next in the queue. Spec §35
 * rule 1 — one click to the next patient.
 */
export function DailyBrief({
  brief,
  pulse,
  nextPatient,
  doctorName,
}: {
  brief: DashboardData["brief"];
  pulse: DashboardData["pulse"];
  nextPatient: DashboardData["nextPatient"];
  doctorName: string;
}) {
  const stats = [
    { value: brief.appointments, label: "appointments" },
    { value: brief.followUps, label: "follow-ups" },
    { value: brief.newPatients, label: "new patients" },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-navy-900 text-navy-100 shadow-raised">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-400">
            Your day
          </p>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            {stats.map((stat) => (
              <span key={stat.label} className="flex items-baseline gap-1.5">
                <span
                  data-numeric
                  className="font-display text-2xl font-bold text-white"
                >
                  {stat.value}
                </span>
                <span className="text-[13px] text-navy-300">{stat.label}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-navy-300">
            {brief.firstAppointment && (
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-navy-400" />
                First appointment{" "}
                <span data-numeric className="font-semibold text-navy-100">
                  {brief.firstAppointment.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  pulse.state === "ATTENTION"
                    ? "bg-destructive"
                    : pulse.state === "BUSY"
                      ? "bg-state-waiting"
                      : "bg-state-completed",
                )}
              />
              {pulse.reason}
            </span>
          </div>
        </div>

        <div className="shrink-0">
          {nextPatient ? (
            <Button size="lg" variant="accent" asChild>
              <Link href="/doctor/queue">
                Start my day
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button size="lg" variant="outline" asChild className="border-navy-700 bg-navy-800 text-navy-100 hover:bg-navy-700 hover:text-white">
              <Link href="/doctor/appointments">View schedule</Link>
            </Button>
          )}
          {nextPatient && (
            <p className="mt-2 text-right text-[12px] text-navy-400">
              Next:{" "}
              <span className="font-mono text-navy-200">{nextPatient.token}</span>{" "}
              · {nextPatient.patientName}
            </p>
          )}
        </div>
      </div>

      <p className="sr-only">Daily brief for {doctorName}</p>
    </section>
  );
}
