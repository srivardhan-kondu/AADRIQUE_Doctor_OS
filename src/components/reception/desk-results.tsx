import Link from "next/link";
import { CalendarPlus, Ticket, UserPlus, UserSearch } from "lucide-react";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BookAppointmentDialog } from "@/components/appointments/book-dialog";
import { RegisterPatientDialog } from "@/components/reception/register-dialog";
import { WalkInDialog } from "@/components/reception/walk-in-dialog";
import type { DoctorChoice } from "@/server/services/front-desk";
import type { PatientSearchRow } from "@/server/services/patients";

/**
 * Spec §13 — search, then act, without leaving the desk.
 *
 * Every result carries the two things the desk does next: a token for today
 * or an appointment for later. Nobody found is one click from registering.
 */
export function DeskResults({
  query,
  patients,
  doctors,
}: {
  query: string;
  patients: PatientSearchRow[];
  doctors: DoctorChoice[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          {patients.length === 0
            ? `No match for “${query}”`
            : `${patients.length} ${patients.length === 1 ? "match" : "matches"} for “${query}”`}
        </p>
      </div>

      {patients.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title="Not registered yet?"
          description="Try the mobile number or patient ID. If they are new, register them — it takes under a minute."
          action={
            <RegisterPatientDialog
              trigger={
                <Button variant="accent">
                  <UserPlus />
                  Register patient
                </Button>
              }
            />
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {patients.map((patient) => {
            const choice = {
              id: patient.id,
              name: patient.name,
              mrn: patient.mrn,
              phone: patient.phone,
              age: patient.age,
            };

            return (
              <li
                key={patient.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback>{initials(patient.name)}</AvatarFallback>
                </Avatar>

                <Link
                  href={`/reception/patients/${patient.id}`}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate text-[14px] font-semibold hover:text-accent">
                    {patient.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                    <span data-numeric className="font-mono">
                      {patient.mrn}
                    </span>
                    {patient.age !== null && (
                      <>
                        <span aria-hidden>·</span>
                        <span data-numeric>{patient.age}y</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span data-numeric>{patient.phone}</span>
                  </span>
                </Link>

                <div className="flex shrink-0 items-center gap-2">
                  <WalkInDialog
                    doctors={doctors}
                    defaultPatient={choice}
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Walk-in token for ${patient.name}`}
                      >
                        <Ticket />
                        Token
                      </Button>
                    }
                  />
                  <BookAppointmentDialog
                    doctors={doctors}
                    defaultPatient={choice}
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Book an appointment for ${patient.name}`}
                      >
                        <CalendarPlus />
                        Book
                      </Button>
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
