import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Patient360View } from "@/components/patients/patient-360-view";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
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

/** A patient record opened from the admin directory. */
export default async function AdminPatientPage({
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

  return (
    <Patient360View
      patient={patient}
      clinical={hasPermission(actor, Permission.CONSULTATION_READ)}
      back={{ href: "/admin/patients", label: "Patient directory" }}
    />
  );
}
