import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { getPrintableVisitReport } from "@/server/services/prescriptions";
import { PrintButton } from "../../prescription/[visitId]/print-button";

export const metadata: Metadata = { title: "Visit report" };

export const dynamic = "force-dynamic";

/**
 * The visit report — the consultation as the doctor typed it, with the
 * vitals and the prescription, ready to print or save as PDF from the
 * browser. An unsigned note prints with a DRAFT mark.
 */
export default async function PrintVisitReportPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/account/password");

  let visit;
  try {
    visit = await getPrintableVisitReport(actor, visitId);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const note = visit.consultation;
  const rx = visit.prescriptions[0];
  const vitals = visit.vitals[0];
  const patient = visit.patient;
  const age =
    patient.approximateAge ??
    (patient.dateOfBirth
      ? Math.floor((visit.startedAt.getTime() - patient.dateOfBirth.getTime()) / (365.25 * 86_400_000))
      : null);

  const sections = [
    { label: "Chief complaint", value: note?.chiefComplaint },
    { label: "Symptoms", value: note?.symptoms },
    { label: "History", value: note?.history },
    { label: "Examination", value: note?.examination },
    { label: "Assessment", value: note?.assessment },
    { label: "Plan", value: note?.plan },
  ].filter((s): s is { label: string; value: string } => Boolean(s.value?.trim()));

  const vitalRows = vitals
    ? [
        vitals.systolicBp && vitals.diastolicBp
          ? `BP ${vitals.systolicBp}/${vitals.diastolicBp} mmHg`
          : null,
        vitals.pulseBpm ? `Pulse ${vitals.pulseBpm} bpm` : null,
        vitals.temperatureC ? `Temp ${vitals.temperatureC.toString()} °C` : null,
        vitals.spo2 ? `SpO₂ ${vitals.spo2}%` : null,
        vitals.respiratoryRate ? `RR ${vitals.respiratoryRate}/min` : null,
        vitals.weightKg ? `Weight ${vitals.weightKg.toString()} kg` : null,
        vitals.heightCm ? `Height ${vitals.heightCm.toString()} cm` : null,
        vitals.bloodGlucose ? `Glucose ${vitals.bloodGlucose.toString()} mg/dL` : null,
      ].filter(Boolean)
    : [];

  const signed = note?.status === "SIGNED";

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

      <p className="mt-4 text-center text-[15px] font-bold uppercase tracking-[0.2em]">
        Consultation report
      </p>

      <section className="mt-3 grid grid-cols-2 gap-y-1 border-b border-neutral-300 pb-4">
        <p><span className="text-neutral-500">Patient:</span> <strong>{`${patient.firstName} ${patient.lastName ?? ""}`.trim()}</strong></p>
        <p className="text-right"><span className="text-neutral-500">Date:</span> {visit.startedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        <p><span className="text-neutral-500">Patient ID:</span> {patient.mrn}{age !== null ? ` · ${age} y` : ""} · {patient.gender.toLowerCase()}</p>
        <p className="text-right"><span className="text-neutral-500">Visit:</span> {visit.visitNumber}</p>
        {patient.allergies.length > 0 && (
          <p className="col-span-2 font-semibold text-red-700">
            Allergies: {patient.allergies.map((a) => a.substance).join(", ")}
          </p>
        )}
      </section>

      {!signed && (
        <p className="mt-4 border-2 border-dashed border-red-600 py-1 text-center text-[15px] font-bold tracking-[0.3em] text-red-600">
          DRAFT — NOT SIGNED
        </p>
      )}

      {vitalRows.length > 0 && (
        <section className="mt-5">
          <p className="font-semibold">Vitals</p>
          <p className="mt-1 text-neutral-700">{vitalRows.join(" · ")}</p>
        </section>
      )}

      {sections.length === 0 ? (
        <p className="mt-5 text-neutral-600">Nothing has been written in this consultation yet.</p>
      ) : (
        sections.map((section) => (
          <section key={section.label} className="mt-5">
            <p className="font-semibold">{section.label}</p>
            <p className="mt-1 whitespace-pre-wrap">{section.value}</p>
          </section>
        ))
      )}

      {rx && rx.items.length > 0 && (
        <section className="mt-6">
          <p className="text-[20px] font-bold italic">℞</p>
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
        </section>
      )}

      {rx?.advice && (
        <section className="mt-5">
          <p className="font-semibold">Advice</p>
          <p className="whitespace-pre-wrap">{rx.advice}</p>
        </section>
      )}

      <footer className="mt-16 flex items-end justify-between">
        <p className="text-[11px] text-neutral-500">
          {signed && note?.signedAt
            ? `Signed ${note.signedAt.toLocaleString("en-IN")}${note.signedByName ? ` by ${note.signedByName}` : ""}`
            : "Not yet signed"}
        </p>
        <div className="text-center">
          <div className="mb-1 h-10 w-48 border-b border-neutral-800" />
          <p>{visit.doctor.user.name}</p>
        </div>
      </footer>
    </main>
  );
}
