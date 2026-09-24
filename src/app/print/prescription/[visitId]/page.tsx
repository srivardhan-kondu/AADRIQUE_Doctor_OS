import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { getPrintablePrescription } from "@/server/services/prescriptions";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Prescription" };

export const dynamic = "force-dynamic";

/**
 * Spec §6 — the prescription as the patient takes it away: clinic, doctor
 * with registration number, patient, date, medicines, advice and a signature
 * line. A draft prints with a DRAFT mark so it is never mistaken for one
 * that was issued.
 */
export default async function PrintPrescriptionPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/account/password");

  let visit;
  try {
    visit = await getPrintablePrescription(actor, visitId);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const rx = visit.prescriptions[0];
  const patient = visit.patient;
  const age =
    patient.approximateAge ??
    (patient.dateOfBirth
      ? Math.floor((visit.startedAt.getTime() - patient.dateOfBirth.getTime()) / (365.25 * 86_400_000))
      : null);

  return (
    <main className="mx-auto max-w-[780px] bg-white p-10 text-[13px] text-neutral-900 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <header className="flex items-start justify-between border-b-2 border-neutral-800 pb-4">
        <div>
          <p className="text-[20px] font-bold">{visit.facility.name}</p>
          <p className="text-neutral-600">
            {[visit.facility.addressLine, visit.facility.city].filter(Boolean).join(", ")}
            {visit.facility.phone ? ` · ${visit.facility.phone}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-bold">{visit.doctor.user.name}</p>
          {visit.doctor.qualifications && <p>{visit.doctor.qualifications}</p>}
          {visit.doctor.registrationNo && <p className="text-neutral-600">Reg. No. {visit.doctor.registrationNo}</p>}
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-y-1 border-b border-neutral-300 pb-4">
        <p><span className="text-neutral-500">Patient:</span> <strong>{`${patient.firstName} ${patient.lastName ?? ""}`.trim()}</strong></p>
        <p className="text-right"><span className="text-neutral-500">Date:</span> {visit.startedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        <p><span className="text-neutral-500">Patient ID:</span> {patient.mrn}{age !== null ? ` · ${age} y` : ""} · {patient.gender.toLowerCase()}</p>
        <p className="text-right"><span className="text-neutral-500">Visit:</span> {visit.visitNumber}</p>
        {patient.allergies.length > 0 && (
          <p className="col-span-2 font-semibold text-red-700">
            Allergies: {patient.allergies.map((a) => a.substance).join(", ")}
          </p>
        )}
        {visit.consultation?.assessment && (
          <p className="col-span-2"><span className="text-neutral-500">Diagnosis:</span> {visit.consultation.assessment}</p>
        )}
      </section>

      {rx?.status === "DRAFT" && (
        <p className="mt-4 border-2 border-dashed border-red-600 py-1 text-center text-[15px] font-bold tracking-[0.3em] text-red-600">
          DRAFT — NOT ISSUED
        </p>
      )}

      <p className="mt-5 text-[26px] font-bold italic">℞</p>
      {!rx || rx.items.length === 0 ? (
        <p className="mt-2 text-neutral-600">No medicines prescribed at this visit.</p>
      ) : (
        <ol className="mt-2 space-y-3">
          {rx.items.map((item, i) => (
            <li key={item.id} className="border-b border-dotted border-neutral-300 pb-2">
              <p className="font-semibold">{i + 1}. {item.medicationName}</p>
              <p className="pl-4 text-neutral-700">
                {[item.dosage, item.frequency, item.durationDays ? `for ${item.durationDays} days` : null]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
              {item.instructions && <p className="pl-4 text-neutral-600">{item.instructions}</p>}
            </li>
          ))}
        </ol>
      )}

      {rx?.advice && (
        <section className="mt-5">
          <p className="font-semibold">Advice</p>
          <p className="whitespace-pre-wrap">{rx.advice}</p>
        </section>
      )}

      <footer className="mt-16 flex items-end justify-between">
        <p className="text-[11px] text-neutral-500">
          {rx?.prescriptionNo}
          {rx?.issuedAt ? ` · issued ${rx.issuedAt.toLocaleString("en-IN")}` : ""}
        </p>
        <div className="text-center">
          <div className="mb-1 h-10 w-48 border-b border-neutral-800" />
          <p>{visit.doctor.user.name}</p>
        </div>
      </footer>
    </main>
  );
}
