import "server-only";
import { prisma } from "@/lib/db";
import type { AISource } from "@/lib/ai";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { notFound } from "../errors";

/**
 * Spec §32 — the retrieval layer.
 *
 * This is the only place AI features read the patient record, and it runs
 * *before* any provider is called. Everything it returns is a fact that is
 * already on the record, carrying the row it came from and a link the doctor
 * can follow (spec §8).
 *
 * That ordering is the whole safety argument. A provider downstream of this
 * has been handed the facts and told it may not exceed them, so the worst it
 * can do is phrase them badly — not invent a history (spec §10).
 *
 * Every query is scoped by `tenantScope` and gated on CONSULTATION_READ: the
 * AI layer gets no wider view of the record than the person invoking it.
 */

/** Refs are positional (S1, S2, …) so a provider can cite them compactly. */
function makeRefs(): () => string {
  let n = 0;
  return () => `S${(n += 1)}`;
}

function formatDate(date: Date | null): string | null {
  return date
    ? date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
}

function daysSince(date: Date): number {
  return Math.round((Date.now() - date.getTime()) / 86_400_000);
}

export interface PatientContext {
  patient: {
    id: string;
    name: string;
    mrn: string;
    age: number | null;
    gender: string;
  };
  sources: AISource[];
}

/**
 * Everything the AI layer is allowed to know about one patient.
 *
 * Bounded deliberately: the most recent handful of each kind, not the whole
 * chart. A brief that lists thirty visits is not a brief, and a prompt that
 * carries a decade of history costs more and answers worse.
 */
export async function gatherPatientContext(
  actor: RequestActor,
  patientId: string,
  options: { visitId?: string | null } = {},
): Promise<PatientContext> {
  assertPermission(actor, Permission.CONSULTATION_READ);

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...tenantScope(actor) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mrn: true,
      dateOfBirth: true,
      approximateAge: true,
      gender: true,
      allergies: {
        where: { active: true },
        select: { substance: true, reaction: true, severity: true, notedAt: true },
      },
      conditions: {
        where: { active: true },
        select: { name: true, since: true, isChronic: true },
      },
    },
  });

  if (!patient) throw notFound("Patient");

  const [consultations, prescriptions, labs, followUps, appointment, vitals] =
    await Promise.all([
      prisma.consultation.findMany({
        where: {
          patientId,
          ...tenantScope(actor),
          status: "SIGNED",
          ...(options.visitId ? { visitId: { not: options.visitId } } : {}),
        },
        orderBy: { signedAt: "desc" },
        take: 4,
        select: {
          id: true,
          visitId: true,
          chiefComplaint: true,
          assessment: true,
          plan: true,
          signedAt: true,
        },
      }),
      prisma.prescription.findMany({
        where: { patientId, visit: tenantScope(actor), status: "ISSUED" },
        orderBy: { issuedAt: "desc" },
        take: 3,
        select: {
          id: true,
          visitId: true,
          issuedAt: true,
          items: { select: { medicationName: true, frequency: true, durationDays: true } },
        },
      }),
      prisma.labReport.findMany({
        where: { patientId, visit: tenantScope(actor) },
        orderBy: { resultAt: "desc" },
        take: 3,
        select: {
          id: true,
          visitId: true,
          testName: true,
          panel: true,
          abnormal: true,
          summary: true,
          resultAt: true,
        },
      }),
      prisma.followUp.findMany({
        where: {
          patientId,
          ...tenantScope(actor),
          status: { in: ["PENDING", "SCHEDULED"] },
        },
        orderBy: { dueDate: "asc" },
        take: 3,
        select: { id: true, dueDate: true, reason: true, status: true },
      }),
      options.visitId
        ? prisma.appointment.findFirst({
            where: { visit: { id: options.visitId }, ...tenantScope(actor) },
            select: { id: true, reason: true, type: true, scheduledStart: true },
          })
        : null,
      prisma.vital.findFirst({
        where: { patientId, ...(options.visitId ? { visitId: options.visitId } : {}) },
        orderBy: { recordedAt: "desc" },
        select: {
          systolicBp: true,
          diastolicBp: true,
          pulseBpm: true,
          temperatureC: true,
          spo2: true,
          recordedAt: true,
        },
      }),
    ]);

  const ref = makeRefs();
  const sources: AISource[] = [];

  if (appointment) {
    sources.push({
      ref: ref(),
      kind: "APPOINTMENT",
      label: "Today's appointment",
      detail:
        appointment.reason ??
        `${appointment.type.toLowerCase().replace(/_/g, " ")} appointment`,
      at: formatDate(appointment.scheduledStart),
      href: "/doctor/appointments",
    });
  }

  for (const consultation of consultations) {
    const detail = [
      consultation.chiefComplaint,
      consultation.assessment && `Assessment: ${consultation.assessment}`,
      consultation.plan && `Plan: ${consultation.plan}`,
    ]
      .filter(Boolean)
      .join(" · ");

    sources.push({
      ref: ref(),
      kind: "CONSULTATION",
      label: "Consultation",
      detail: detail || "Consultation recorded",
      at: formatDate(consultation.signedAt),
      href: `/doctor/consultations/${consultation.visitId}`,
    });
  }

  for (const prescription of prescriptions) {
    const medicines = prescription.items
      .map((item) => `${item.medicationName} ${item.frequency}`)
      .join(", ");

    sources.push({
      ref: ref(),
      kind: "PRESCRIPTION",
      label: "Prescription",
      detail: medicines || "Prescription issued",
      at: formatDate(prescription.issuedAt),
      href: `/doctor/consultations/${prescription.visitId}`,
    });
  }

  for (const lab of labs) {
    sources.push({
      ref: ref(),
      kind: "LAB_REPORT",
      label: lab.testName,
      detail: `${lab.testName}${lab.panel ? ` (${lab.panel})` : ""} — ${
        lab.abnormal
          ? "one or more values outside the reference range"
          : "within the reference range"
      }`,
      at: formatDate(lab.resultAt),
      href: `/doctor/consultations/${lab.visitId}`,
    });
  }

  for (const followUp of followUps) {
    const days = daysSince(followUp.dueDate);
    const timing =
      days > 0
        ? `overdue by ${days} ${days === 1 ? "day" : "days"}`
        : days === 0
          ? "due today"
          : `due in ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;

    sources.push({
      ref: ref(),
      kind: "FOLLOW_UP",
      label: "Follow-up",
      detail: `Follow-up ${timing}${followUp.reason ? ` — ${followUp.reason}` : ""}`,
      at: formatDate(followUp.dueDate),
      href: "/doctor/follow-ups",
    });
  }

  for (const allergy of patient.allergies) {
    sources.push({
      ref: ref(),
      kind: "ALLERGY",
      label: "Allergy",
      detail: `Allergy: ${allergy.substance}${
        allergy.reaction ? ` — ${allergy.reaction}` : ""
      } (${allergy.severity.toLowerCase()})`,
      at: formatDate(allergy.notedAt),
      href: `/doctor/patients/${patient.id}`,
    });
  }

  for (const condition of patient.conditions) {
    sources.push({
      ref: ref(),
      kind: "CONDITION",
      label: "Condition",
      detail: `${condition.isChronic ? "Chronic condition" : "Condition"}: ${condition.name}`,
      at: formatDate(condition.since),
      href: `/doctor/patients/${patient.id}`,
    });
  }

  if (vitals) {
    const readings = [
      vitals.systolicBp && vitals.diastolicBp
        ? `BP ${vitals.systolicBp}/${vitals.diastolicBp}`
        : null,
      vitals.pulseBpm ? `pulse ${vitals.pulseBpm}` : null,
      vitals.temperatureC ? `temp ${vitals.temperatureC}°C` : null,
      vitals.spo2 ? `SpO2 ${vitals.spo2}%` : null,
    ].filter(Boolean);

    if (readings.length > 0) {
      sources.push({
        ref: ref(),
        kind: "VITAL",
        label: "Vitals",
        detail: `Recorded vitals: ${readings.join(", ")}`,
        at: formatDate(vitals.recordedAt),
        href: null,
      });
    }
  }

  const age =
    patient.approximateAge ??
    (patient.dateOfBirth
      ? Math.floor(
          (Date.now() - patient.dateOfBirth.getTime()) /
            (365.25 * 24 * 60 * 60 * 1000),
        )
      : null);

  return {
    patient: {
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName ?? ""}`.trim(),
      mrn: patient.mrn,
      age,
      gender: patient.gender,
    },
    sources,
  };
}

/**
 * Spec §9 — natural-language retrieval over one patient's record.
 *
 * Deliberately a keyword search over the record rather than a model call:
 * "find the last migraine visit" is a retrieval question, and the honest
 * answer is the matching rows, not a paraphrase of them. The model's job
 * comes after, if at all.
 */
export async function searchPatientRecord(
  actor: RequestActor,
  patientId: string,
  query: string,
): Promise<AISource[]> {
  assertPermission(actor, Permission.CONSULTATION_READ);

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    // Drop the words every question contains; they match everything.
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  if (terms.length === 0) return [];

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...tenantScope(actor) },
    select: { id: true },
  });
  if (!patient) throw notFound("Patient");

  const [consultations, diagnoses, prescriptions, labs] = await Promise.all([
    prisma.consultation.findMany({
      where: {
        patientId,
        ...tenantScope(actor),
        status: "SIGNED",
        OR: terms.flatMap((term) => [
          { chiefComplaint: { contains: term, mode: "insensitive" as const } },
          { assessment: { contains: term, mode: "insensitive" as const } },
          { symptoms: { contains: term, mode: "insensitive" as const } },
          { plan: { contains: term, mode: "insensitive" as const } },
        ]),
      },
      orderBy: { signedAt: "desc" },
      take: 10,
      select: {
        visitId: true,
        chiefComplaint: true,
        assessment: true,
        signedAt: true,
      },
    }),
    prisma.diagnosis.findMany({
      where: {
        patientId,
        OR: terms.map((term) => ({
          name: { contains: term, mode: "insensitive" as const },
        })),
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { visitId: true, name: true, createdAt: true },
    }),
    prisma.prescription.findMany({
      where: {
        patientId,
        visit: tenantScope(actor),
        items: {
          some: {
            OR: terms.map((term) => ({
              medicationName: { contains: term, mode: "insensitive" as const },
            })),
          },
        },
      },
      orderBy: { issuedAt: "desc" },
      take: 10,
      select: {
        visitId: true,
        issuedAt: true,
        items: { select: { medicationName: true, frequency: true } },
      },
    }),
    prisma.labReport.findMany({
      where: {
        patientId,
        visit: tenantScope(actor),
        OR: terms.flatMap((term) => [
          { testName: { contains: term, mode: "insensitive" as const } },
          { panel: { contains: term, mode: "insensitive" as const } },
        ]),
      },
      orderBy: { resultAt: "desc" },
      take: 10,
      select: { visitId: true, testName: true, abnormal: true, resultAt: true },
    }),
  ]);

  const ref = makeRefs();
  const sources: AISource[] = [];

  for (const row of consultations) {
    sources.push({
      ref: ref(),
      kind: "CONSULTATION",
      label: "Consultation",
      detail: row.chiefComplaint ?? row.assessment ?? "Consultation recorded",
      at: formatDate(row.signedAt),
      href: `/doctor/consultations/${row.visitId}`,
    });
  }

  for (const row of diagnoses) {
    sources.push({
      ref: ref(),
      kind: "CONDITION",
      label: "Diagnosis",
      detail: `Diagnosed: ${row.name}`,
      at: formatDate(row.createdAt),
      href: `/doctor/consultations/${row.visitId}`,
    });
  }

  for (const row of prescriptions) {
    // The prescription matched on one of its medicines — lead with that one,
    // so the reason this row is in the results is the first thing read.
    const items = [...row.items].sort((a, b) => {
      const aHit = terms.some((t) => a.medicationName.toLowerCase().includes(t));
      const bHit = terms.some((t) => b.medicationName.toLowerCase().includes(t));
      return Number(bHit) - Number(aHit);
    });

    sources.push({
      ref: ref(),
      kind: "PRESCRIPTION",
      label: "Prescription",
      detail: items
        .map((i) => `${i.medicationName} ${i.frequency}`)
        .join(", "),
      at: formatDate(row.issuedAt),
      href: `/doctor/consultations/${row.visitId}`,
    });
  }

  for (const row of labs) {
    sources.push({
      ref: ref(),
      kind: "LAB_REPORT",
      label: row.testName,
      detail: `${row.testName} — ${
        row.abnormal ? "abnormal" : "within the reference range"
      }`,
      at: formatDate(row.resultAt),
      href: `/doctor/consultations/${row.visitId}`,
    });
  }

  return sources;
}

/**
 * Spec §42 — retrieval over approved hospital documents.
 *
 * Only approved, indexed documents are searchable. An uploaded-but-unapproved
 * policy is not an answer the assistant may give.
 */
export async function searchKnowledgeBase(
  actor: RequestActor,
  query: string,
  limit = 5,
): Promise<AISource[]> {
  assertPermission(actor, Permission.AI_USE);

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  if (terms.length === 0) return [];

  const chunks = await prisma.documentChunk.findMany({
    where: {
      document: {
        ...tenantScope(actor),
        approved: true,
        status: "INDEXED",
      },
      OR: terms.map((term) => ({
        content: { contains: term, mode: "insensitive" as const },
      })),
    },
    take: 40,
    select: {
      id: true,
      content: true,
      chunkIndex: true,
      document: { select: { id: true, title: true, category: true, updatedAt: true } },
    },
  });

  // Rank by how many distinct query terms a chunk actually contains — a
  // passage matching three of the words beats one matching the same word
  // three times.
  const ranked = chunks
    .map((chunk) => {
      const haystack = chunk.content.toLowerCase();
      const hits = terms.filter((term) => haystack.includes(term)).length;
      return { chunk, hits };
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);

  const ref = makeRefs();

  return ranked.map(({ chunk }) => ({
    ref: ref(),
    kind: "DOCUMENT" as const,
    label: chunk.document.title,
    detail: chunk.content.trim(),
    at: formatDate(chunk.document.updatedAt),
    href: "/admin/ai",
  }));
}

/** Words that appear in every question and so discriminate nothing. */
const STOP_WORDS = new Set([
  "the", "what", "when", "where", "which", "who", "why", "how", "for", "and",
  "are", "was", "were", "has", "have", "had", "did", "does", "our", "this",
  "that", "with", "from", "his", "her", "their", "there", "last", "find",
  "show", "tell", "give", "get", "any", "all", "can", "you", "patient",
  "patients", "visit", "visits", "about", "please",
]);
