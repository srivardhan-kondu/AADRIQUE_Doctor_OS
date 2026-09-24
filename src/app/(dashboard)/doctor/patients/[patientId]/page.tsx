import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { DocumentsPanel } from "@/components/documents/patient-documents";
import { Patient360View } from "@/components/patients/patient-360-view";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getPatient360 } from "@/server/services/patients";
import { ServiceError } from "@/server/services/errors";

/**
 * The title and the page both need the patient. `cache` makes that one read
 * per request rather than loading the whole record twice.
 */
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
    const patient = await loadPatient(patientId);
    return { title: patient.name };
  } catch {
    return { title: "Patient" };
  }
}

export default async function Patient360Page({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  let patient;
  try {
    patient = await loadPatient(patientId);
  } catch (error) {
    // A record in another tenant and a missing one look identical (spec §22).
    if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const actor = await requireActor();

  return (
    <Patient360View
      patient={patient}
      clinical={hasPermission(actor, Permission.CONSULTATION_READ)}
      back={{ href: "/doctor/queue", label: "Back to queue" }}
      documents={<DocumentsPanel patientId={patient.id} />}
    />
  );
}
