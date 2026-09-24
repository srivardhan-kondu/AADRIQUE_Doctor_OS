import type { PrismaClient } from "../src/generated/prisma/client.js";

/**
 * The client-demo layer of the seed (spec §39).
 *
 * The main seed makes a busy, believable clinic. This adds what a live demo
 * needs on top of it:
 *
 *   - one patient with a year-long story — Lakshmi Iyer, diabetic and
 *     hypertensive, allergic to penicillins — waiting first in Dr. Ananya
 *     Rao's queue today, so every screen has something worth opening;
 *   - a real PDF behind every lab report, so documents open;
 *   - issued prescriptions on today's finished visits, so one can be printed.
 *
 * Everything is marked as demonstration data where a person could read it.
 */

type Db = PrismaClient;

const DAY = 86_400_000;

/* ---------------------------------- PDF ---------------------------------- */

interface Line {
  text: string;
  size?: number;
  bold?: boolean;
  /** Fixed-width, for columns that must line up. */
  mono?: boolean;
  gap?: number;
}

/** A one-page PDF of plain text lines — enough for a lab report. ASCII only. */
export function textPdf(lines: Line[]): Uint8Array<ArrayBuffer> {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");
  let y = 800;
  const ops: string[] = [];
  for (const line of lines) {
    const size = line.size ?? 10;
    y -= line.gap ?? size + 6;
    ops.push(`BT /${line.mono ? (line.bold ? "F4" : "F3") : line.bold ? "F2" : "F1"} ${size} Tf 50 ${y} Td (${escape(line.text)}) Tj ET`);
  }
  const stream = ops.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 7 0 R /F4 8 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(new TextEncoder().encode(body));
}

/* ------------------------------ lab analytes ------------------------------ */

interface Analyte {
  name: string;
  unit: string;
  range: string;
  normal: number;
  abnormal: number;
}

const ANALYTES: Record<string, Analyte[]> = {
  "Complete Blood Count": [
    { name: "Haemoglobin", unit: "g/dL", range: "12.0 - 15.5", normal: 13.4, abnormal: 10.1 },
    { name: "Total WBC count", unit: "x10^3/uL", range: "4.0 - 11.0", normal: 7.2, abnormal: 13.8 },
    { name: "Platelet count", unit: "x10^3/uL", range: "150 - 410", normal: 268, abnormal: 262 },
    { name: "ESR", unit: "mm/hr", range: "0 - 20", normal: 12, abnormal: 34 },
  ],
  HbA1c: [
    { name: "HbA1c", unit: "%", range: "4.0 - 5.6", normal: 5.4, abnormal: 7.8 },
    { name: "Estimated average glucose", unit: "mg/dL", range: "68 - 114", normal: 108, abnormal: 177 },
  ],
  "Lipid Profile": [
    { name: "Total cholesterol", unit: "mg/dL", range: "< 200", normal: 176, abnormal: 238 },
    { name: "LDL cholesterol", unit: "mg/dL", range: "< 100", normal: 92, abnormal: 156 },
    { name: "HDL cholesterol", unit: "mg/dL", range: "> 40", normal: 52, abnormal: 44 },
    { name: "Triglycerides", unit: "mg/dL", range: "< 150", normal: 128, abnormal: 212 },
  ],
  "Thyroid Function Test": [
    { name: "TSH", unit: "uIU/mL", range: "0.4 - 4.0", normal: 2.1, abnormal: 7.9 },
    { name: "Free T4", unit: "ng/dL", range: "0.8 - 1.8", normal: 1.2, abnormal: 0.7 },
  ],
  "Liver Function Test": [
    { name: "SGPT (ALT)", unit: "U/L", range: "7 - 56", normal: 31, abnormal: 88 },
    { name: "SGOT (AST)", unit: "U/L", range: "10 - 40", normal: 27, abnormal: 64 },
    { name: "Total bilirubin", unit: "mg/dL", range: "0.2 - 1.2", normal: 0.8, abnormal: 1.1 },
  ],
  "Serum Creatinine": [
    { name: "Serum creatinine", unit: "mg/dL", range: "0.6 - 1.2", normal: 0.9, abnormal: 1.6 },
    { name: "eGFR", unit: "mL/min/1.73m2", range: "> 90", normal: 96, abnormal: 52 },
  ],
  "Vitamin D (25-OH)": [
    { name: "25-hydroxy vitamin D", unit: "ng/mL", range: "30 - 100", normal: 42, abnormal: 14 },
  ],
  "Chest X-Ray PA view": [],
};

function labPdf(input: {
  facility: string;
  patient: string;
  mrn: string;
  age: number | null;
  gender: string;
  test: string;
  panel: string | null;
  collectedAt: Date;
  resultAt: Date;
  values: { name: string; value: string; unit: string; range: string; high: boolean }[];
  impression: string;
}): Uint8Array<ArrayBuffer> {
  const date = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const lines: Line[] = [
    { text: `${input.facility} - Diagnostic Laboratory`, size: 16, bold: true, gap: 0 },
    { text: "NABL-style demonstration report - not a real patient", size: 8 },
    { text: `Patient: ${input.patient}    ID: ${input.mrn}    ${input.age ?? "-"} y / ${input.gender.toLowerCase()}`, gap: 30 },
    { text: `Collected: ${date(input.collectedAt)}    Reported: ${date(input.resultAt)}` },
    { text: `${input.test}${input.panel ? `  (${input.panel})` : ""}`, size: 13, bold: true, gap: 30 },
  ];
  if (input.values.length > 0) {
    lines.push({ text: `${"Test".padEnd(30)}${"Result".padEnd(10)}${"Unit".padEnd(15)}Reference`, bold: true, mono: true, size: 9, gap: 24 });
    for (const v of input.values) {
      lines.push({
        text: `${v.name.padEnd(30)}${(v.value + (v.high ? " *" : "")).padEnd(10)}${v.unit.padEnd(15)}${v.range}`,
        mono: true,
        size: 9,
      });
    }
    lines.push({ text: "* outside the reference range", size: 8, gap: 18 });
  }
  lines.push({ text: "Impression", bold: true, gap: 26 });
  lines.push({ text: input.impression });
  lines.push({ text: "Electronically verified. Clinical correlation advised.", size: 8, gap: 40 });
  return textPdf(lines);
}

function analyteValues(test: string, abnormal: boolean, override?: Record<string, number>) {
  return (ANALYTES[test] ?? []).map((a, index) => {
    // One analyte out of range when the report is abnormal, the first by default.
    const high = abnormal && index === 0;
    const value = override?.[a.name] ?? (high ? a.abnormal : a.normal);
    return { name: a.name, value: String(value), unit: a.unit, range: a.range, high: override ? isOut(a, value) : high };
  });
}

function isOut(a: Analyte, value: number): boolean {
  const range = a.range.replace(/\s/g, "");
  if (range.startsWith("<")) return value >= Number(range.slice(1));
  if (range.startsWith(">")) return value <= Number(range.slice(1));
  const [lo, hi] = range.split("-").map(Number);
  return value < lo || value > hi;
}

/* ------------------------------- the steps ------------------------------- */

export async function seedShowcase(db: Db, organizationId: string, today: Date) {
  const doctor = await db.doctorProfile.findFirstOrThrow({
    where: { user: { email: "ananya.rao@aadrique.demo" } },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      tokenPrefix: true,
      user: { select: { name: true } },
      facility: { select: { name: true } },
    },
  });
  const nurse = await db.user.findFirstOrThrow({ where: { email: "nurse@aadrique.demo" }, select: { id: true } });

  await seedLakshmi(db, organizationId, today, doctor);
  const reports = await attachLabPdfs(db, organizationId, doctor.facility.name, nurse.id);
  const prescriptions = await prescribeTodaysVisits(db, organizationId, today);
  console.log(`  showcase patient Lakshmi Iyer, ${reports} lab report PDFs, ${prescriptions} prescriptions for today's visits`);
}

type Doctor = {
  id: string;
  facilityId: string;
  departmentId: string | null;
  tokenPrefix: string;
  user: { name: string };
  facility: { name: string };
};

/**
 * Lakshmi Iyer, 58: type 2 diabetes since 2019, hypertension since 2021,
 * penicillin allergy. Four visits with Dr. Rao over nine months show her
 * sugar and blood pressure coming under control; her latest HbA1c arrived
 * two days ago and is waiting for review. Today she is back for the
 * follow-up Dr. Rao asked for, first in line and not yet measured.
 */
async function seedLakshmi(db: Db, organizationId: string, today: Date, doctor: Doctor) {
  const now = new Date();
  const at = (daysAgo: number, hour: number, minute = 0) => {
    const d = new Date(today.getTime() - daysAgo * DAY);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const dateOfBirth = new Date(today);
  dateOfBirth.setFullYear(today.getFullYear() - 58, 2, 14);

  const patient = await db.patient.create({
    data: {
      organizationId,
      facilityId: doctor.facilityId,
      mrn: "P-000101",
      firstName: "Lakshmi",
      lastName: "Iyer",
      gender: "FEMALE",
      dateOfBirth,
      bloodGroup: "B_POSITIVE",
      phone: "+919876500101",
      email: "lakshmi.iyer@example.demo",
      addressLine: "7-1-24, Road No. 3, Banjara Hills",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500034",
      emergencyContactName: "Ramesh Iyer (husband)",
      emergencyContactPhone: "+919876500102",
      whatsappOptIn: true,
      smsOptIn: true,
      emailOptIn: true,
      preferredLanguage: "en",
      lastVisitAt: at(30, 10, 20),
      allergies: {
        create: [
          // Recorded with the drugs named, the way the allergy check matches.
          { substance: "Penicillins (amoxicillin, ampicillin)", reaction: "Rash and facial swelling (2016)", severity: "CRITICAL" },
          { substance: "Sulfonamides", reaction: "Itching", severity: "MODERATE" },
        ],
      },
      conditions: {
        create: [
          { name: "Type 2 diabetes mellitus", code: "E11.9", since: new Date("2019-06-01") },
          { name: "Essential hypertension", code: "I10", since: new Date("2021-02-01") },
        ],
      },
      flags: { create: [{ label: "Prefers morning appointments", severity: "LOW" }] },
      identifiers: { create: [{ type: "ABHA", value: "91-4821-7730-5519", issuer: "NDHM (demo)" }] },
    },
    select: { id: true },
  });

  /** Her past visits — the story the timeline, the brief and history search tell. */
  const story = [
    {
      daysAgo: 270,
      complaint: "Tiredness, frequent urination for 3 weeks",
      history: "Known T2DM since 2019 on metformin 500 mg once daily; irregular with diet. Hypertensive since 2021, on amlodipine 5 mg.",
      examination: "Alert, BMI 30.5. No pedal oedema. Feet: sensation intact, no ulcers.",
      assessment: "Type 2 diabetes, poorly controlled (HbA1c 8.4%). Hypertension, not at target.",
      plan: "Increase metformin to 500 mg twice daily. Add telmisartan 40 mg. Diet counselling given. HbA1c and lipids in 3 months.",
      vitals: { systolicBp: 148, diastolicBp: 94, pulseBpm: 88, weightKg: 78, temperatureC: 36.8, spo2: 98 },
      items: [
        ["Metformin 500 mg", "1 tablet", "Twice daily", 90, "After breakfast and dinner"],
        ["Telmisartan 40 mg", "1 tablet", "Once daily", 90, "In the morning"],
        ["Amlodipine 5 mg", "1 tablet", "Once daily", 90, "At night"],
      ],
      hba1c: 8.4,
    },
    {
      daysAgo: 180,
      complaint: "Diabetes and BP review",
      history: "Taking medicines regularly. Walking 20 minutes most days. Occasional dizziness on standing.",
      examination: "BMI 29.8. Postural drop 8 mmHg. Feet normal.",
      assessment: "Diabetes improving (HbA1c 7.6%). BP improved; mild postural symptoms.",
      plan: "Continue metformin and telmisartan. Stop amlodipine. Rise slowly. Review in 3 months with HbA1c.",
      vitals: { systolicBp: 138, diastolicBp: 88, pulseBpm: 82, weightKg: 76.5, temperatureC: 36.6, spo2: 98 },
      items: [
        ["Metformin 500 mg", "1 tablet", "Twice daily", 90, "After meals"],
        ["Telmisartan 40 mg", "1 tablet", "Once daily", 90, "In the morning"],
      ],
      hba1c: 7.6,
    },
    {
      daysAgo: 90,
      complaint: "Burning feet at night, review",
      history: "Burning sensation in both soles for a month, worse at night. Sugars at home 130-160 fasting.",
      examination: "BMI 29.2. Monofilament: reduced sensation both forefeet. Pulses present.",
      assessment: "Early peripheral neuropathy. Diabetes better controlled (HbA1c 7.1%).",
      plan: "Add pregabalin 75 mg at night. Foot care advice. Lipid profile before next visit.",
      vitals: { systolicBp: 134, diastolicBp: 86, pulseBpm: 78, weightKg: 75.4, temperatureC: 36.7, spo2: 99 },
      items: [
        ["Metformin 500 mg", "1 tablet", "Twice daily", 90, "After meals"],
        ["Telmisartan 40 mg", "1 tablet", "Once daily", 90, "In the morning"],
        ["Pregabalin 75 mg", "1 capsule", "At night", 30, "May cause drowsiness"],
      ],
      hba1c: 7.1,
    },
    {
      daysAgo: 30,
      complaint: "Lipid review, neuropathy follow-up",
      history: "Burning feet much better on pregabalin. LDL 156 on recent profile. No chest pain.",
      examination: "BMI 28.9. Feet: no ulcers. Heart sounds normal.",
      assessment: "Dyslipidaemia (LDL 156 mg/dL) in a diabetic. Neuropathy responding. BP near target.",
      plan: "Start atorvastatin 20 mg at night. Repeat HbA1c before next visit. Follow-up in 4 weeks.",
      vitals: { systolicBp: 132, diastolicBp: 84, pulseBpm: 76, weightKg: 74.2, temperatureC: 36.6, spo2: 98 },
      items: [
        ["Metformin 500 mg", "1 tablet", "Twice daily", 90, "After meals"],
        ["Telmisartan 40 mg", "1 tablet", "Once daily", 90, "In the morning"],
        ["Atorvastatin 20 mg", "1 tablet", "At night", 90, "Report muscle pain"],
        ["Pregabalin 75 mg", "1 capsule", "At night", 30, "Continue"],
      ],
      hba1c: null,
    },
  ] as const;

  let lastVisitId = "";
  for (const [index, visit] of story.entries()) {
    const startedAt = at(visit.daysAgo, 10, 5);
    const completedAt = new Date(startedAt.getTime() + 15 * 60_000);
    const created = await db.visit.create({
      data: {
        organizationId,
        facilityId: doctor.facilityId,
        departmentId: doctor.departmentId,
        patientId: patient.id,
        doctorId: doctor.id,
        visitNumber: `V-DEMO-LI-${index + 1}`,
        stage: "COMPLETED",
        status: "COMPLETED",
        startedAt,
        completedAt,
        chiefComplaint: visit.complaint,
        consultation: {
          create: {
            organizationId,
            patientId: patient.id,
            doctorId: doctor.id,
            chiefComplaint: visit.complaint,
            symptoms: visit.complaint,
            history: visit.history,
            examination: visit.examination,
            assessment: visit.assessment,
            plan: visit.plan,
            status: "SIGNED",
            signedAt: completedAt,
            signedByName: doctor.user.name,
            createdAt: startedAt,
          },
        },
        vitals: {
          create: { patientId: patient.id, heightCm: 160, respiratoryRate: 16, ...visit.vitals, recordedAt: new Date(startedAt.getTime() - 10 * 60_000) },
        },
      },
      select: { id: true, consultation: { select: { id: true } } },
    });
    lastVisitId = created.id;

    await db.diagnosis.create({
      data: {
        visitId: created.id,
        consultationId: created.consultation!.id,
        patientId: patient.id,
        name: "Type 2 diabetes mellitus",
        code: "E11.9",
        isPrimary: true,
      },
    });
    await db.prescription.create({
      data: {
        visitId: created.id,
        consultationId: created.consultation!.id,
        patientId: patient.id,
        doctorId: doctor.id,
        prescriptionNo: `RX-V-DEMO-LI-${index + 1}`,
        status: "ISSUED",
        issuedAt: completedAt,
        createdAt: completedAt,
        advice: "Walk 30 minutes daily. Avoid sweets and fried food. Check fasting sugar twice a week.",
        items: {
          create: visit.items.map(([name, dosage, frequency, durationDays, instructions], order) => ({
            medicationName: name,
            dosage,
            frequency,
            route: "Oral",
            durationDays,
            instructions,
            sortOrder: order,
          })),
        },
      },
    });
    if (visit.hba1c !== null) {
      await db.labReport.create({
        data: {
          visitId: created.id,
          patientId: patient.id,
          testName: "HbA1c",
          panel: "Diabetes",
          status: "REVIEWED",
          orderedAt: startedAt,
          collectedAt: new Date(startedAt.getTime() - 3 * DAY),
          resultAt: new Date(startedAt.getTime() - 2 * DAY),
          reviewedAt: startedAt,
          abnormal: visit.hba1c > 5.6,
          summary: `HbA1c ${visit.hba1c}%`,
          results: [{ analyte: "HbA1c", value: visit.hba1c, unit: "%", flag: visit.hba1c > 5.6 ? "HIGH" : "NORMAL" }],
        },
      });
    }
  }

  // Lipids before the last visit, reviewed; the new HbA1c arrived two days
  // ago and is waiting for Dr. Rao.
  await db.labReport.create({
    data: {
      patientId: patient.id,
      visitId: lastVisitId,
      testName: "Lipid Profile",
      panel: "Biochemistry",
      status: "REVIEWED",
      orderedAt: at(34, 9),
      collectedAt: at(33, 8),
      resultAt: at(32, 17),
      reviewedAt: at(30, 10, 10),
      abnormal: true,
      summary: "LDL 156 mg/dL, triglycerides 212 mg/dL - above target for a diabetic.",
      results: [
        { analyte: "Total cholesterol", value: 238, unit: "mg/dL", flag: "HIGH" },
        { analyte: "LDL cholesterol", value: 156, unit: "mg/dL", flag: "HIGH" },
        { analyte: "HDL cholesterol", value: 44, unit: "mg/dL", flag: "NORMAL" },
        { analyte: "Triglycerides", value: 212, unit: "mg/dL", flag: "HIGH" },
      ],
    },
  });
  await db.labReport.create({
    data: {
      patientId: patient.id,
      testName: "HbA1c",
      panel: "Diabetes",
      status: "RESULT_AVAILABLE",
      orderedAt: at(30, 10, 20),
      collectedAt: at(3, 8),
      resultAt: at(2, 16),
      abnormal: true,
      summary: "HbA1c 6.9% - improving, just above the 6.5-7% goal range.",
      results: [
        { analyte: "HbA1c", value: 6.9, unit: "%", flag: "HIGH" },
        { analyte: "Estimated average glucose", value: 151, unit: "mg/dL", flag: "HIGH" },
      ],
    },
  });

  await db.feedback.create({
    data: {
      organizationId,
      patientId: patient.id,
      doctorId: doctor.id,
      visitId: lastVisitId,
      rating: 5,
      comment: "Dr. Rao explains everything patiently. The WhatsApp reminders help me a lot.",
      requestedAt: at(30, 12),
      respondedAt: at(30, 19),
    },
  });

  /* Today: booked follow-up, checked in, first in line, vitals not yet taken. */
  const queue = await db.queue.findFirstOrThrow({
    where: { doctorId: doctor.id, date: today },
    select: { id: true, lastTokenSeq: true, entries: { where: { status: { in: ["WAITING", "VITALS"] } }, select: { position: true } } },
  });
  const front = Math.min(...queue.entries.map((e) => e.position), 1_000);
  // "Call next" rightly takes a priority patient first; in the demo doctor's
  // line nobody is, so the next patient is always Lakshmi. Other doctors'
  // queues keep their priority patients to show that.
  await db.queueEntry.updateMany({
    where: { queueId: queue.id, status: { in: ["WAITING", "VITALS"] } },
    data: { priority: "NORMAL" },
  });
  await db.queueEntry.updateMany({
    where: { queueId: queue.id, position: { gte: front } },
    data: { position: { increment: 1 } },
  });
  const tokenSeq = queue.lastTokenSeq + 1;
  await db.queue.update({ where: { id: queue.id }, data: { lastTokenSeq: tokenSeq } });

  const joinedAt = new Date(now.getTime() - 14 * 60_000);
  const scheduledStart = new Date(now.getTime() + 10 * 60_000);
  const appointment = await db.appointment.create({
    data: {
      organizationId,
      facilityId: doctor.facilityId,
      departmentId: doctor.departmentId,
      patientId: patient.id,
      doctorId: doctor.id,
      scheduledStart,
      scheduledEnd: new Date(scheduledStart.getTime() + 15 * 60_000),
      type: "FOLLOW_UP",
      status: "WAITING",
      source: "ONLINE",
      reason: "Diabetes follow-up, HbA1c result",
      checkedInAt: joinedAt,
      createdAt: at(6, 20, 45),
      queueEntry: {
        create: {
          queueId: queue.id,
          patientId: patient.id,
          token: `${doctor.tokenPrefix}${String(tokenSeq).padStart(3, "0")}`,
          tokenSeq,
          status: "WAITING",
          position: front,
          joinedAt,
        },
      },
    },
    select: { id: true },
  });

  await db.followUp.create({
    data: {
      organizationId,
      patientId: patient.id,
      doctorId: doctor.id,
      visitId: lastVisitId,
      appointmentId: appointment.id,
      dueDate: today,
      reason: "Review repeat HbA1c; statin tolerance",
      status: "SCHEDULED",
      reminderSentAt: at(1, 10),
      createdAt: at(30, 10, 20),
    },
  });

  // The reminder went out yesterday and she replied; the reply is unread.
  await db.message.createMany({
    data: [
      {
        organizationId,
        patientId: patient.id,
        appointmentId: appointment.id,
        channel: "WHATSAPP",
        direction: "OUTBOUND",
        status: "READ",
        toAddress: "+919876500101",
        body: `Reminder: your appointment with ${doctor.user.name} is tomorrow at ${scheduledStart.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Call 040 6677 8899 if you need a different time.`,
        providerName: "simulated",
        sentAt: at(1, 10),
        deliveredAt: at(1, 10, 1),
        readAt: at(1, 10, 12),
        createdAt: at(1, 10),
      },
      {
        organizationId,
        patientId: patient.id,
        channel: "WHATSAPP",
        direction: "INBOUND",
        status: "DELIVERED",
        toAddress: "+919876500101",
        body: "Thank you, I will come. Should I come fasting for any test?",
        providerName: "simulated",
        deliveredAt: at(1, 10, 18),
        createdAt: at(1, 10, 18),
      },
    ],
  });
}

/** A PDF behind every lab report that has none, so documents open in the demo. */
async function attachLabPdfs(db: Db, organizationId: string, facility: string, uploadedById: string): Promise<number> {
  const reports = await db.labReport.findMany({
    where: { patient: { organizationId }, attachments: { none: {} } },
    include: {
      patient: { select: { firstName: true, lastName: true, mrn: true, gender: true, dateOfBirth: true } },
    },
  });

  for (const report of reports) {
    const stored = Array.isArray(report.results) ? (report.results as { analyte: string; value: number }[]) : [];
    const known = (ANALYTES[report.testName] ?? []).map((a) => a.name);
    const override = stored.every((r) => known.includes(r.analyte)) && stored.length > 0
      ? Object.fromEntries(stored.map((r) => [r.analyte, r.value]))
      : undefined;
    const collectedAt = report.collectedAt ?? report.orderedAt;
    const resultAt = report.resultAt ?? collectedAt;
    const age = report.patient.dateOfBirth
      ? Math.floor((resultAt.getTime() - report.patient.dateOfBirth.getTime()) / (365.25 * DAY))
      : null;

    const bytes = labPdf({
      facility,
      patient: `${report.patient.firstName} ${report.patient.lastName ?? ""}`.trim(),
      mrn: report.patient.mrn,
      age,
      gender: report.patient.gender,
      test: report.testName,
      panel: report.panel,
      collectedAt,
      resultAt,
      values: analyteValues(report.testName, report.abnormal, override),
      impression:
        report.testName === "Chest X-Ray PA view"
          ? report.abnormal
            ? "Mild prominence of bronchovascular markings. No consolidation or effusion."
            : "Lung fields clear. Cardiac silhouette normal. No bony abnormality."
          : (report.summary ?? "See values above."),
    });

    const storageKey = `${organizationId}/seed-${report.id}`;
    await db.fileBlob.create({ data: { key: storageKey, bytes } });
    const slug = report.testName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await db.attachment.create({
      data: {
        organizationId,
        patientId: report.patientId,
        visitId: report.visitId,
        labReportId: report.id,
        fileName: `${slug}-${resultAt.toISOString().slice(0, 10)}.pdf`,
        storageKey,
        contentType: "application/pdf",
        sizeBytes: bytes.byteLength,
        kind: "LAB_REPORT",
        uploadedById,
        createdAt: resultAt,
      },
    });
  }
  return reports.length;
}

/** Today's signed visits get the prescription the doctor would have written. */
async function prescribeTodaysVisits(db: Db, organizationId: string, today: Date): Promise<number> {
  const visits = await db.visit.findMany({
    where: {
      organizationId,
      startedAt: { gte: today },
      consultation: { status: "SIGNED" },
      prescriptions: { none: {} },
    },
    select: { id: true, visitNumber: true, patientId: true, doctorId: true, completedAt: true, consultation: { select: { id: true } } },
  });
  const medicines = await db.medication.findMany({ orderBy: { name: "asc" } });

  for (const [index, visit] of visits.entries()) {
    const picks = [0, 1, 2].slice(0, 2 + (index % 2)).map((k) => medicines[(index * 3 + k * 7) % medicines.length]);
    await db.prescription.create({
      data: {
        visitId: visit.id,
        consultationId: visit.consultation!.id,
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        prescriptionNo: `RX-${visit.visitNumber}`,
        status: "ISSUED",
        issuedAt: visit.completedAt ?? new Date(),
        advice: index % 2 ? "Plenty of fluids and rest. Review if not better in three days." : "Take medicines after food.",
        items: {
          create: picks.map((m, order) => ({
            medicationId: m.id,
            medicationName: [m.name, m.strength].filter(Boolean).join(" "),
            dosage: m.form === "Syrup" ? "5 ml" : "1 tablet",
            frequency: ["Twice daily (BD)", "Three times daily (TDS)", "Once daily (OD)"][(index + order) % 3],
            route: m.form === "Inhaler" ? "Inhalation" : "Oral",
            durationDays: [5, 7, 3][(index + order) % 3],
            instructions: order === 0 ? "After food" : null,
            sortOrder: order,
          })),
        },
      },
    });
  }
  return visits.length;
}
