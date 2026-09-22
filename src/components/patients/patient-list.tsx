import Link from "next/link";
import { AlertTriangle, ChevronRight, Activity } from "lucide-react";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { UserSearch } from "lucide-react";
import type { PatientSearchRow } from "@/server/services/patients";

function relativeDay(date: Date | null): string {
  if (!date) return "No visits yet";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PatientList({
  patients,
  query,
}: {
  patients: PatientSearchRow[];
  query: string;
}) {
  if (patients.length === 0) {
    return (
      <EmptyState
        icon={UserSearch}
        title={query ? `Nothing matches “${query}”` : "No patients yet"}
        description={
          query
            ? "Try a mobile number, a patient ID, or part of the name."
            : "Patients registered at the front desk will appear here."
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {patients.map((patient) => (
        <li key={patient.id}>
          <Link
            href={`/doctor/patients/${patient.id}`}
            className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-muted"
          >
            <Avatar className="size-10 shrink-0">
              <AvatarFallback>{initials(patient.name)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[14px] font-medium">
                  {patient.name}
                </span>
                {patient.allergyCount > 0 && (
                  <Badge variant="destructive">
                    <AlertTriangle />
                    {patient.allergyCount}
                  </Badge>
                )}
                {patient.conditionCount > 0 && (
                  <Badge variant="muted">
                    <Activity />
                    {patient.conditionCount}
                  </Badge>
                )}
                {patient.flags.slice(0, 2).map((flag) => (
                  <Badge key={flag} variant="outline">
                    {flag}
                  </Badge>
                ))}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                <span data-numeric className="font-mono">
                  {patient.mrn}
                </span>
                <span aria-hidden>·</span>
                {patient.age !== null && (
                  <>
                    <span data-numeric>{patient.age}y</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span className="capitalize">
                  {patient.gender.toLowerCase()}
                </span>
                <span aria-hidden>·</span>
                <span data-numeric>{patient.phone}</span>
              </p>
            </div>

            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Last visit
              </p>
              <p className="mt-0.5 text-[12px] font-medium">
                {relativeDay(patient.lastVisitAt)}
              </p>
            </div>

            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
