import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { CalendarPlus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookAppointmentDialog } from "@/components/appointments/book-dialog";
import { Patient360View } from "@/components/patients/patient-360-view";
import { WalkInDialog } from "@/components/reception/walk-in-dialog";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { listBookableDoctors } from "@/server/services/front-desk";
import { getPatient360 } from "@/server/services/patients";

const loadPatient = cache(async (patientId: string) =>
  getPatient360(await requireActor(), patientId),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ patientId: string }>;
}): Promise<Metadata> {
  const { patientId } = await params;
  try {
    return { title: (await loadPatient(patientId)).name };
  } catch {
    return { title: "Patient" };
  }
}

/**
 * The front desk's patient page (spec §13): who they are, how to reach them,
 * their visits and bookings — and the token or appointment that comes next.
 * Clinical content is withheld by the service, not by this page (spec §21).
 */
export default async function ReceptionPatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  let patient;
  try {
    patient = await loadPatient(patientId);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const actor = await requireActor();
  const doctors = await listBookableDoctors(actor);
  const choice = {
    id: patient.id,
    name: patient.name,
    mrn: patient.mrn,
    phone: patient.phone,
    age: patient.age,
  };

  return (
    <Patient360View
      patient={patient}
      clinical={hasPermission(actor, Permission.CONSULTATION_READ)}
      back={{ href: "/reception/patients", label: "All patients" }}
      actions={
        <>
          {hasPermission(actor, Permission.QUEUE_MANAGE) && (
            <WalkInDialog
              doctors={doctors}
              defaultPatient={choice}
              trigger={
                <Button variant="accent">
                  <Ticket />
                  Token
                </Button>
              }
            />
          )}
          {hasPermission(actor, Permission.APPOINTMENT_CREATE) && (
            <BookAppointmentDialog
              doctors={doctors}
              defaultPatient={choice}
              trigger={
                <Button variant="outline">
                  <CalendarPlus />
                  Book
                </Button>
              }
            />
          )}
        </>
      }
    />
  );
}
