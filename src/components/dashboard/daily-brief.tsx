import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StartMyDayButton } from "@/components/queue/queue-actions";
import type { DashboardData } from "@/server/services/dashboard";

/**
 * Spec §18 — the Doctor Daily Brief, with Start My Day.
 *
 * One panel for the day's numbers. Each one is a link to the screen where
 * those patients are, so the number is also the way in.
 *
 * "Start my day" calls the first patient in — the next actual task (spec §35
 * rule 1). Once anyone has been called today it has done its job, and the
 * button becomes "View schedule".
 */
export function DailyBrief({
  brief,
  metrics,
  pulse,
  nextPatient,
  dayStarted,
  doctorName,
}: {
  brief: DashboardData["brief"];
  metrics: DashboardData["metrics"];
  pulse: DashboardData["pulse"];
  nextPatient: DashboardData["nextPatient"];
  dayStarted: boolean;
  doctorName: string;
}) {
  const stats = [
    { value: brief.appointments, label: "Appointments", href: "/doctor/appointments" },
    { value: metrics.total, label: "Patients today", href: "/doctor/patients" },
    { value: metrics.inConsultation, label: "In consultation", href: "/doctor/queue" },
    { value: metrics.completed, label: "Completed", href: "/doctor/consultations" },
    { value: metrics.followUpsDue, label: "Follow-ups due", href: "/doctor/follow-ups" },
    { value: brief.newPatients, label: "New patients", href: "/doctor/patients" },
  ];

  const showStart = !dayStarted && nextPatient !== null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-navy-900 text-navy-100 shadow-raised">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-400">
            Your day
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-navy-300">
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

        <div className="shrink-0 lg:text-right">
          {showStart ? (
            <StartMyDayButton />
          ) : (
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-navy-700 bg-navy-800 text-navy-100 hover:bg-navy-700 hover:text-white"
            >
              <Link href="/doctor/appointments">View schedule</Link>
            </Button>
          )}
          {nextPatient && (
            <p className="mt-2 text-[12px] text-navy-400">
              Next:{" "}
              <span className="font-mono text-navy-200">{nextPatient.token}</span>{" "}
              · {nextPatient.patientName}
            </p>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-2 border-t border-navy-800 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <li key={stat.label} className="min-w-0">
            <Link
              href={stat.href}
              className="group flex h-full flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-navy-800"
            >
              <span
                data-numeric
                className="font-display text-2xl font-bold leading-none text-white"
              >
                {stat.value}
              </span>
              <span className="flex items-center gap-0.5 text-[12px] text-navy-300 group-hover:text-navy-100">
                <span className="truncate">{stat.label}</span>
                <ChevronRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="sr-only">Daily brief for {doctorName}</p>
    </section>
  );
}
