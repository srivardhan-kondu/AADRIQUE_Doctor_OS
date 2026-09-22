import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "../src/generated/prisma/client.js";
import {
  AIActionStatus,
  AIActionType,
  AppointmentStatus,
  AppointmentType,
  AuditAction,
  BloodGroup,
  BookingSource,
  ConsultationStatus,
  FollowUpStatus,
  Gender,
  IntegrationCategory,
  IntegrationStatus,
  LabReportStatus,
  MessageCategory,
  MessageChannel,
  MessageStatus,
  NotificationLevel,
  PatientFlowStage,
  PrescriptionStatus,
  QueueEntryStatus,
  QueuePriority,
  QueueStatus,
  Role,
  Severity,
  VisitStatus,
  WorkflowTriggerType,
} from "../src/generated/prisma/enums.js";
import { hashPassword } from "../src/lib/auth/password.js";
import {
  ALLERGENS,
  COMPLAINTS,
  CONDITIONS,
  DEPARTMENTS,
  DOCTORS,
  DOSE_INSTRUCTIONS,
  FIRST_NAMES_FEMALE,
  FIRST_NAMES_MALE,
  FREQUENCIES,
  LAB_PANELS,
  LAST_NAMES,
  MEDICATIONS,
  PATIENT_FLAGS,
} from "./seed-data.js";
import {
  at,
  createIdFactory,
  createRandom,
  dayOffset,
  minutesAfter,
  phoneNumber,
  sequenceNo,
} from "./seed-helpers.js";

/**
 * Demo seed (spec §39).
 *
 * Creates AADRIQUE Medical Center with five departments, five doctors and a
 * realistic year of OPD history, plus a live queue for today so the dashboard
 * has something moving the moment it opens.
 *
 * Deterministic: re-running produces the same dataset. Destructive: it clears
 * the demo organisation first, so never point it at production.
 */

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DATABASE_URL (and ideally DIRECT_DATABASE_URL) in .env");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const random = createRandom(20260922);
const id = createIdFactory();

const ORG_SLUG = "aadrique-medical-center";
const DEMO_PASSWORD = "aadrique123";

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

/** Counts from spec §39. */
const PATIENT_COUNT = 100;
const HISTORICAL_VISIT_COUNT = 250;
const APPOINTMENT_COUNT = 50;
const FOLLOW_UP_COUNT = 20;
const PRESCRIPTION_COUNT = 15;
const LAB_REPORT_COUNT = 10;
const MESSAGE_COUNT = 100;

async function main() {
  console.log("Seeding AADRIQUE demo data…");

  await reset();

  const { organizationId, facilityId, departments } = await seedOrganization();
  const { doctors, staff } = await seedPeople(organizationId, facilityId, departments);
  const medications = await seedFormulary();
  await seedTemplatesAndIntegrations(organizationId);

  const patients = await seedPatients(organizationId, facilityId);

  const history = await seedHistory({
    organizationId,
    facilityId,
    departments,
    doctors,
    patients,
    medications,
  });

  await seedToday({
    organizationId,
    facilityId,
    departments,
    doctors,
    patients,
  });

  await seedFollowUpsAndFeedback({ organizationId, doctors, patients, history });
  await seedCommunications({ organizationId, patients });
  await seedNotificationsAndAudit({ organizationId, doctors, staff, patients });

  await summarise(organizationId);
}

/** Removes the demo organisation. Cascades handle everything beneath it. */
async function reset() {
  const existing = await prisma.organization.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });

  if (!existing) return;

  console.log("  clearing previous demo data…");
  // Users are not owned by the organisation, so they are removed explicitly.
  await prisma.user.deleteMany({
    where: { memberships: { some: { organizationId: existing.id } } },
  });
  await prisma.organization.delete({ where: { id: existing.id } });
  await prisma.medication.deleteMany({});
}

async function seedOrganization() {
  const organizationId = id("org");
  const facilityId = id("fac");

  await prisma.organization.create({
    data: {
      id: organizationId,
      name: "AADRIQUE Health",
      slug: ORG_SLUG,
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      modules: {
        opd: true,
        appointments: true,
        queue: true,
        consultation: true,
        communication: true,
        analytics: true,
        ai: true,
        integrations: true,
      },
      settings: {
        waitAlertMinutes: 20,
        queueCapacityAlert: 6,
        feedbackDelayHours: 2,
      },
    },
  });

  await prisma.facility.create({
    data: {
      id: facilityId,
      organizationId,
      name: "AADRIQUE Medical Center",
      code: "AMC-HYD",
      addressLine: "Plot 14, Financial District, Nanakramguda",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500032",
      phone: "+914066778899",
      email: "frontdesk@aadrique.demo",
    },
  });

  const departments = DEPARTMENTS.map((d) => ({ ...d, id: id("dept"), facilityId }));
  await prisma.department.createMany({ data: departments });

  console.log(`  organisation, facility and ${departments.length} departments`);
  return { organizationId, facilityId, departments };
}

type Department = Awaited<ReturnType<typeof seedOrganization>>["departments"][number];

async function seedPeople(
  organizationId: string,
  facilityId: string,
  departments: Department[],
) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const byCode = new Map(departments.map((d) => [d.code, d]));

  const staffDefinitions = [
    { name: "Sneha Reddy", email: "admin@aadrique.demo", role: Role.HOSPITAL_ADMIN },
    { name: "Arjun Menon", email: "frontdesk@aadrique.demo", role: Role.RECEPTIONIST },
    { name: "Kavitha Nair", email: "nurse@aadrique.demo", role: Role.NURSE },
  ];

  const users: Prisma.UserCreateManyInput[] = [];
  const memberships: Prisma.MembershipCreateManyInput[] = [];

  const staff = staffDefinitions.map((s) => {
    const userId = id("usr");
    users.push({
      id: userId,
      email: s.email,
      name: s.name,
      passwordHash,
      phone: phoneNumber(random),
      emailVerified: new Date(),
      mfaEnabled: s.role === Role.HOSPITAL_ADMIN,
    });
    memberships.push({
      id: id("mem"),
      userId,
      organizationId,
      facilityId,
      role: s.role,
    });
    return { ...s, userId };
  });

  const doctors = DOCTORS.map((d) => {
    const userId = id("usr");
    const doctorId = id("doc");
    users.push({
      id: userId,
      email: d.email,
      name: d.name,
      passwordHash,
      phone: phoneNumber(random),
      emailVerified: new Date(),
    });
    memberships.push({
      id: id("mem"),
      userId,
      organizationId,
      facilityId,
      role: Role.DOCTOR,
    });
    return {
      ...d,
      userId,
      doctorId,
      departmentId: byCode.get(d.department)!.id,
    };
  });

  await prisma.user.createMany({ data: users });
  await prisma.membership.createMany({ data: memberships });

  await prisma.doctorProfile.createMany({
    data: doctors.map((d, index) => ({
      id: d.doctorId,
      userId: d.userId,
      facilityId,
      departmentId: d.departmentId,
      registrationNo: `TSMC/${2008 + index}/${10_000 + index * 37}`,
      qualifications: d.qualifications,
      specialization: d.specialization,
      experienceYears: d.experienceYears,
      consultationMinutes: d.consultationMinutes,
      tokenPrefix: d.tokenPrefix,
      acceptsWalkIns: true,
      // The first doctor is the demo persona and is always on duty.
      online: index === 0,
    })),
  });

  // Monday–Saturday, 09:30–13:30 and 17:00–20:00, with a mid-morning break.
  await prisma.doctorAvailability.createMany({
    data: doctors.flatMap((d) =>
      [1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
        { id: id("av"), doctorId: d.doctorId, dayOfWeek, startMinute: 9 * 60 + 30, endMinute: 13 * 60 + 30 },
        { id: id("av"), doctorId: d.doctorId, dayOfWeek, startMinute: 17 * 60, endMinute: 20 * 60 },
        {
          id: id("av"),
          doctorId: d.doctorId,
          dayOfWeek,
          startMinute: 11 * 60 + 30,
          endMinute: 11 * 60 + 45,
          isBlock: true,
          label: "Break",
        },
      ]),
    ),
  });

  console.log(`  ${doctors.length} doctors, ${staff.length} staff users`);
  return { doctors, staff };
}

type Doctor = Awaited<ReturnType<typeof seedPeople>>["doctors"][number];
type Staff = Awaited<ReturnType<typeof seedPeople>>["staff"][number];

async function seedFormulary() {
  const medications = MEDICATIONS.map((m) => ({ ...m, id: id("med") }));
  await prisma.medication.createMany({ data: medications });
  return medications;
}

type Medication = Awaited<ReturnType<typeof seedFormulary>>[number];

async function seedTemplatesAndIntegrations(organizationId: string) {
  /** Spec §14 — transactional and engagement templates. */
  const templates = [
    {
      key: "appointment_confirmation",
      name: "Appointment confirmation",
      channel: MessageChannel.WHATSAPP,
      category: MessageCategory.TRANSACTIONAL,
      body: "Hello {{patientName}}, your appointment with {{doctorName}} is confirmed for {{appointmentDate}} at {{appointmentTime}}. — AADRIQUE Medical Center",
      variables: ["patientName", "doctorName", "appointmentDate", "appointmentTime"],
    },
    {
      key: "appointment_reminder",
      name: "Appointment reminder",
      channel: MessageChannel.WHATSAPP,
      category: MessageCategory.TRANSACTIONAL,
      body: "Reminder: your appointment with {{doctorName}} is tomorrow at {{appointmentTime}}. Reply RESCHEDULE if you need a different time.",
      variables: ["doctorName", "appointmentTime"],
    },
    {
      key: "token_generated",
      name: "Token generated",
      channel: MessageChannel.SMS,
      category: MessageCategory.TRANSACTIONAL,
      body: "Your token is {{token}}. Current token is {{currentToken}}. Estimated wait {{waitMinutes}} minutes.",
      variables: ["token", "currentToken", "waitMinutes"],
    },
    {
      key: "token_approaching",
      name: "Token approaching",
      channel: MessageChannel.SMS,
      category: MessageCategory.TRANSACTIONAL,
      body: "{{patientName}}, you are next. Please proceed to {{roomLabel}}.",
      variables: ["patientName", "roomLabel"],
    },
    {
      key: "appointment_cancelled",
      name: "Appointment cancelled",
      channel: MessageChannel.SMS,
      category: MessageCategory.TRANSACTIONAL,
      body: "Your appointment with {{doctorName}} on {{appointmentDate}} has been cancelled. Call {{facilityPhone}} to rebook.",
      variables: ["doctorName", "appointmentDate", "facilityPhone"],
    },
    {
      key: "follow_up_reminder",
      name: "Follow-up reminder",
      channel: MessageChannel.WHATSAPP,
      category: MessageCategory.TRANSACTIONAL,
      body: "Hello {{patientName}}, your follow-up consultation is scheduled for {{followUpDate}} at {{followUpTime}}.",
      variables: ["patientName", "followUpDate", "followUpTime"],
    },
    {
      key: "feedback_request",
      name: "Feedback request",
      channel: MessageChannel.WHATSAPP,
      category: MessageCategory.ENGAGEMENT,
      body: "Thank you for visiting {{doctorName}} today. How was your experience? Reply with a rating from 1 to 5.",
      variables: ["doctorName"],
    },
    {
      key: "health_camp",
      name: "Health camp announcement",
      channel: MessageChannel.EMAIL,
      category: MessageCategory.ENGAGEMENT,
      subject: "Free cardiac screening camp this Sunday",
      body: "AADRIQUE Medical Center is hosting a free cardiac screening camp on {{campDate}}. Walk in between 9 AM and 1 PM.",
      variables: ["campDate"],
    },
  ];

  await prisma.messageTemplate.createMany({
    data: templates.map((t) => ({
      id: id("tpl"),
      organizationId,
      key: t.key,
      name: t.name,
      channel: t.channel,
      category: t.category,
      subject: t.subject ?? null,
      body: t.body,
      variables: t.variables,
      active: true,
    })),
  });

  /** Spec §29 — each integration behind an adapter, with a visible status. */
  await prisma.integration.createMany({
    data: [
      {
        id: id("int"),
        organizationId,
        category: IntegrationCategory.WHATSAPP,
        provider: "meta-cloud-api",
        name: "WhatsApp Business",
        status: IntegrationStatus.CONNECTED,
        config: { phoneNumberId: "demo-phone-id", wabaId: "demo-waba" },
        credentialRef: "secret://demo/whatsapp",
        lastHealthCheckAt: minutesAfter(new Date(), -12),
        lastSyncAt: minutesAfter(new Date(), -12),
      },
      {
        id: id("int"),
        organizationId,
        category: IntegrationCategory.SMS,
        provider: "msg91",
        name: "SMS Gateway",
        status: IntegrationStatus.CONNECTED,
        config: { senderId: "AADRIQ" },
        credentialRef: "secret://demo/sms",
        lastHealthCheckAt: minutesAfter(new Date(), -25),
      },
      {
        id: id("int"),
        organizationId,
        category: IntegrationCategory.EMAIL,
        provider: "resend",
        name: "Transactional Email",
        status: IntegrationStatus.CONNECTED,
        config: { fromAddress: "care@aadrique.demo" },
        credentialRef: "secret://demo/email",
        lastHealthCheckAt: minutesAfter(new Date(), -40),
      },
      {
        id: id("int"),
        organizationId,
        category: IntegrationCategory.LAB,
        provider: "thyrocare",
        name: "Lab Information System",
        status: IntegrationStatus.NEEDS_ATTENTION,
        config: { centreCode: "HYD-114" },
        credentialRef: "secret://demo/lab",
        lastHealthCheckAt: minutesAfter(new Date(), -180),
        lastError: "Result webhook returned 401 for the last 3 deliveries",
      },
      {
        id: id("int"),
        organizationId,
        category: IntegrationCategory.PHARMACY,
        provider: "internal-pharmacy",
        name: "Pharmacy",
        status: IntegrationStatus.NOT_CONFIGURED,
      },
      {
        id: id("int"),
        organizationId,
        category: IntegrationCategory.HMS,
        provider: "legacy-hms",
        name: "Hospital Management System",
        status: IntegrationStatus.DISCONNECTED,
        config: { baseUrl: "https://hms.internal.demo" },
        lastError: "Connection refused",
      },
    ],
  });

  /** Spec §28 — automations as data, not hard-coded branches. */
  await prisma.workflow.createMany({
    data: [
      {
        id: id("wf"),
        organizationId,
        name: "Appointment confirmation and reminder",
        description: "Confirm on booking, then remind 24 hours before.",
        trigger: WorkflowTriggerType.APPOINTMENT_SCHEDULED,
        enabled: true,
        steps: [
          { type: "ACTION", action: "SEND_MESSAGE", templateKey: "appointment_confirmation", channel: "WHATSAPP" },
          { type: "WAIT", until: "24_HOURS_BEFORE_APPOINTMENT" },
          { type: "CONDITION", field: "appointment.status", operator: "EQUALS", value: "SCHEDULED" },
          { type: "ACTION", action: "SEND_MESSAGE", templateKey: "appointment_reminder", channel: "WHATSAPP" },
        ],
      },
      {
        id: id("wf"),
        organizationId,
        name: "Feedback request after consultation",
        description: "Wait two hours after a completed visit, then ask for a rating.",
        trigger: WorkflowTriggerType.APPOINTMENT_COMPLETED,
        enabled: true,
        steps: [
          { type: "WAIT", duration: { hours: 2 } },
          { type: "CONDITION", field: "patient.phone", operator: "IS_PRESENT" },
          { type: "CONDITION", field: "patient.whatsappOptIn", operator: "EQUALS", value: true },
          { type: "ACTION", action: "SEND_MESSAGE", templateKey: "feedback_request", channel: "WHATSAPP" },
          { type: "ACTION", action: "CREATE_FEEDBACK_RECORD" },
        ],
      },
      {
        id: id("wf"),
        organizationId,
        name: "Follow-up reminder",
        description: "Remind the patient the day before a follow-up is due.",
        trigger: WorkflowTriggerType.FOLLOW_UP_DUE,
        enabled: true,
        steps: [
          { type: "WAIT", until: "1_DAY_BEFORE_DUE" },
          { type: "CONDITION", field: "followUp.status", operator: "EQUALS", value: "PENDING" },
          { type: "ACTION", action: "SEND_MESSAGE", templateKey: "follow_up_reminder", channel: "WHATSAPP" },
        ],
      },
      {
        id: id("wf"),
        organizationId,
        name: "Token notification",
        description: "Tell the patient their token, then warn them when they are next.",
        trigger: WorkflowTriggerType.TOKEN_GENERATED,
        enabled: false,
        steps: [
          { type: "ACTION", action: "SEND_MESSAGE", templateKey: "token_generated", channel: "SMS" },
        ],
      },
    ],
  });

  console.log(`  ${templates.length} message templates, 6 integrations, 4 workflows`);
}

async function seedPatients(organizationId: string, facilityId: string) {
  const patients = Array.from({ length: PATIENT_COUNT }, (_, index) => {
    const isFemale = random.chance(0.52);
    const firstName = random.pick(
      isFemale ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE,
    );
    const lastName = random.pick(LAST_NAMES);
    const age = random.int(1, 84);
    const dateOfBirth = new Date(TODAY);
    dateOfBirth.setFullYear(dateOfBirth.getFullYear() - age);
    dateOfBirth.setMonth(random.int(0, 11), random.int(1, 28));

    return {
      id: id("pat"),
      organizationId,
      facilityId,
      mrn: sequenceNo("P", index + 1),
      firstName,
      lastName,
      gender: isFemale ? Gender.FEMALE : Gender.MALE,
      dateOfBirth,
      bloodGroup: random.pick(Object.values(BloodGroup).filter((b) => b !== BloodGroup.UNKNOWN)),
      phone: phoneNumber(random),
      email: random.chance(0.45)
        ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.demo`
        : null,
      addressLine: `${random.int(1, 400)}, ${random.pick(["Jubilee Hills", "Gachibowli", "Madhapur", "Kondapur", "Banjara Hills", "Kukatpally"])}`,
      city: "Hyderabad",
      state: "Telangana",
      postalCode: `5000${random.int(10, 99)}`,
      emergencyContactName: `${random.pick([...FIRST_NAMES_FEMALE, ...FIRST_NAMES_MALE])} ${lastName}`,
      emergencyContactPhone: phoneNumber(random),
      whatsappOptIn: random.chance(0.9),
      smsOptIn: true,
      emailOptIn: random.chance(0.35),
      preferredLanguage: random.pick(["en", "en", "en", "te", "hi"]),
      age,
    };
  });

  await prisma.patient.createMany({
    data: patients.map(({ age: _age, ...p }) => p),
  });

  // Allergies, chronic conditions and operational flags (spec §6).
  const allergies: Prisma.PatientAllergyCreateManyInput[] = [];
  const conditions: Prisma.PatientConditionCreateManyInput[] = [];
  const flags: Prisma.PatientFlagCreateManyInput[] = [];
  const identifiers: Prisma.PatientIdentifierCreateManyInput[] = [];

  for (const patient of patients) {
    if (random.chance(0.3)) {
      for (const allergen of random.sample(ALLERGENS, random.int(1, 2))) {
        allergies.push({
          id: id("alg"),
          patientId: patient.id,
          substance: allergen.substance,
          reaction: allergen.reaction,
          severity: random.pick([Severity.LOW, Severity.MODERATE, Severity.HIGH, Severity.CRITICAL]),
        });
      }
    }

    // Chronic disease becomes much more likely with age.
    const conditionChance = patient.age > 55 ? 0.7 : patient.age > 35 ? 0.35 : 0.1;
    if (random.chance(conditionChance)) {
      for (const condition of random.sample(CONDITIONS, random.int(1, 2))) {
        const since = new Date(TODAY);
        since.setFullYear(since.getFullYear() - random.int(1, 12));
        conditions.push({
          id: id("cond"),
          patientId: patient.id,
          name: condition.name,
          code: condition.code,
          since,
          isChronic: true,
        });
      }
    }

    if (random.chance(0.12)) {
      flags.push({
        id: id("flag"),
        patientId: patient.id,
        label: random.pick(PATIENT_FLAGS),
        severity: random.pick([Severity.LOW, Severity.MODERATE]),
      });
    }

    if (random.chance(0.4)) {
      identifiers.push({
        id: id("pid"),
        patientId: patient.id,
        type: "ABHA",
        value: `${random.int(10, 99)}-${random.int(1000, 9999)}-${random.int(1000, 9999)}-${random.int(1000, 9999)}`,
        isPrimary: true,
      });
    }
  }

  await prisma.patientAllergy.createMany({ data: allergies });
  await prisma.patientCondition.createMany({ data: conditions });
  await prisma.patientFlag.createMany({ data: flags });
  await prisma.patientIdentifier.createMany({ data: identifiers });

  console.log(
    `  ${patients.length} patients (${allergies.length} allergies, ${conditions.length} conditions, ${flags.length} flags)`,
  );
  return patients;
}

type Patient = Awaited<ReturnType<typeof seedPatients>>[number];

interface HistoryArgs {
  organizationId: string;
  facilityId: string;
  departments: Department[];
  doctors: Doctor[];
  patients: Patient[];
  medications: Medication[];
}

/**
 * A year of completed OPD history: visits, signed consultations, vitals,
 * diagnoses, prescriptions and lab reports.
 */
async function seedHistory({
  organizationId,
  facilityId,
  departments,
  doctors,
  patients,
  medications,
}: HistoryArgs) {
  const byCode = new Map(departments.map((d) => [d.code, d]));

  const visits: Prisma.VisitCreateManyInput[] = [];
  const consultations: Prisma.ConsultationCreateManyInput[] = [];
  const vitals: Prisma.VitalCreateManyInput[] = [];
  const diagnoses: Prisma.DiagnosisCreateManyInput[] = [];

  const records: Array<{
    visitId: string;
    consultationId: string;
    patientId: string;
    doctorId: string;
    departmentId: string;
    startedAt: Date;
  }> = [];

  const lastVisitByPatient = new Map<string, Date>();

  for (let i = 0; i < HISTORICAL_VISIT_COUNT; i += 1) {
    const patient = random.pick(patients);
    const doctor = random.pick(doctors);
    const department = byCode.get(doctor.department)!;

    // Spread across the last year, weighted towards recent months.
    const daysAgo = Math.round(Math.pow(random.next(), 1.6) * 330) + 2;
    const day = dayOffset(TODAY, -daysAgo);
    const startedAt = at(day, random.int(9, 19), random.pick([0, 15, 30, 45]));
    const completedAt = minutesAfter(startedAt, doctor.consultationMinutes + random.int(-3, 8));

    const visitId = id("vis");
    const consultationId = id("cons");
    const complaint = random.pick(COMPLAINTS[doctor.department]);

    visits.push({
      id: visitId,
      organizationId,
      facilityId,
      departmentId: department.id,
      patientId: patient.id,
      doctorId: doctor.doctorId,
      visitNumber: sequenceNo("V", i + 1),
      stage: PatientFlowStage.COMPLETED,
      status: VisitStatus.COMPLETED,
      startedAt,
      completedAt,
      chiefComplaint: complaint,
    });

    consultations.push({
      id: consultationId,
      organizationId,
      visitId,
      patientId: patient.id,
      doctorId: doctor.doctorId,
      chiefComplaint: complaint,
      symptoms: random.pick([
        "Symptoms began gradually, no aggravating factor identified.",
        "Intermittent, worse in the evenings.",
        "Continuous since onset, partially relieved by rest.",
        "Episodic, three to four times a day.",
      ]),
      history: random.chance(0.5)
        ? "No significant change since the previous visit."
        : "Reports good adherence to the previous prescription.",
      examination: random.pick([
        "Afebrile, vitals stable. Systemic examination unremarkable.",
        "Mild tenderness on palpation. No guarding or rigidity.",
        "Chest clear on auscultation. Cardiovascular examination normal.",
        "Range of motion preserved. No swelling or deformity.",
      ]),
      assessment: complaint,
      plan: random.pick([
        "Symptomatic management. Review in two weeks.",
        "Continue current medication. Repeat investigations before next visit.",
        "Lifestyle advice reinforced. Follow up in one month.",
        "Prescription issued. Return earlier if symptoms worsen.",
      ]),
      status: ConsultationStatus.SIGNED,
      signedAt: completedAt,
      signedByName: doctor.name,
      createdAt: startedAt,
      updatedAt: completedAt,
    });

    vitals.push({
      id: id("vit"),
      visitId,
      patientId: patient.id,
      heightCm: random.int(140, 185),
      weightKg: random.int(42, 96),
      temperatureC: (365 + random.int(0, 20)) / 10,
      pulseBpm: random.int(62, 98),
      respiratoryRate: random.int(12, 20),
      systolicBp: random.int(104, 150),
      diastolicBp: random.int(66, 94),
      spo2: random.int(95, 100),
      recordedAt: minutesAfter(startedAt, -random.int(4, 14)),
    });

    if (random.chance(0.6)) {
      const condition = random.pick(CONDITIONS);
      diagnoses.push({
        id: id("dx"),
        visitId,
        consultationId,
        patientId: patient.id,
        name: condition.name,
        code: condition.code,
        isPrimary: true,
        createdAt: completedAt,
      });
    }

    const previous = lastVisitByPatient.get(patient.id);
    if (!previous || startedAt > previous) {
      lastVisitByPatient.set(patient.id, startedAt);
    }

    records.push({
      visitId,
      consultationId,
      patientId: patient.id,
      doctorId: doctor.doctorId,
      departmentId: department.id,
      startedAt,
    });
  }

  await prisma.visit.createMany({ data: visits });
  await prisma.consultation.createMany({ data: consultations });
  await prisma.vital.createMany({ data: vitals });
  await prisma.diagnosis.createMany({ data: diagnoses });

  // lastVisitAt drives "Last Visit" on Patient 360 and the recency sort.
  await Promise.all(
    [...lastVisitByPatient.entries()].map(([patientId, lastVisitAt]) =>
      prisma.patient.update({ where: { id: patientId }, data: { lastVisitAt } }),
    ),
  );

  await seedPrescriptions(records, medications);
  await seedLabReports(records);

  console.log(`  ${visits.length} historical visits with signed consultations`);
  return records;
}

type HistoryRecord = Awaited<ReturnType<typeof seedHistory>>[number];

async function seedPrescriptions(
  records: HistoryRecord[],
  medications: Medication[],
) {
  const chosen = random.sample(records, PRESCRIPTION_COUNT);
  const prescriptions: Prisma.PrescriptionCreateManyInput[] = [];
  const items: Prisma.PrescriptionItemCreateManyInput[] = [];

  chosen.forEach((record, index) => {
    const prescriptionId = id("rx");
    prescriptions.push({
      id: prescriptionId,
      visitId: record.visitId,
      consultationId: record.consultationId,
      patientId: record.patientId,
      doctorId: record.doctorId,
      prescriptionNo: sequenceNo("RX", index + 1, 5),
      status: PrescriptionStatus.ISSUED,
      advice: random.pick([
        "Take medicines after food. Drink plenty of water.",
        "Complete the full course even if symptoms settle.",
        "Report immediately if there is fever above 101°F.",
        "Continue home exercises as demonstrated.",
      ]),
      issuedAt: record.startedAt,
      createdAt: record.startedAt,
    });

    for (const [order, medication] of random.sample(medications, random.int(2, 4)).entries()) {
      items.push({
        id: id("rxi"),
        prescriptionId,
        medicationId: medication.id,
        medicationName: `${medication.name} ${medication.strength}`,
        dosage: "1 " + (medication.form === "Syrup" ? "spoon" : "unit"),
        frequency: random.pick(FREQUENCIES),
        route: medication.form === "Inhaler" ? "Inhalation" : "Oral",
        durationDays: random.pick([3, 5, 7, 10, 14, 30]),
        instructions: random.pick(DOSE_INSTRUCTIONS),
        sortOrder: order,
      });
    }
  });

  await prisma.prescription.createMany({ data: prescriptions });
  await prisma.prescriptionItem.createMany({ data: items });
  console.log(`  ${prescriptions.length} prescriptions with ${items.length} items`);
}

async function seedLabReports(records: HistoryRecord[]) {
  const chosen = random.sample(records, LAB_REPORT_COUNT);

  await prisma.labReport.createMany({
    data: chosen.map((record) => {
      const panel = random.pick(LAB_PANELS);
      const abnormal = random.chance(0.4);
      const resultAt = minutesAfter(record.startedAt, random.int(120, 2880));

      return {
        id: id("lab"),
        visitId: record.visitId,
        patientId: record.patientId,
        testName: panel.testName,
        panel: panel.panel,
        status: LabReportStatus.RESULT_AVAILABLE,
        orderedAt: record.startedAt,
        collectedAt: minutesAfter(record.startedAt, random.int(20, 90)),
        resultAt,
        abnormal,
        summary: abnormal
          ? "One or more values outside the reference range. Clinical correlation advised."
          : "All reported values within the reference range.",
        results: [
          {
            analyte: panel.testName,
            value: random.int(4, 14),
            unit: random.pick(["g/dL", "%", "mg/dL", "mmol/L"]),
            flag: abnormal ? "HIGH" : "NORMAL",
          },
        ],
      };
    }),
  });

  console.log(`  ${chosen.length} lab reports`);
}

interface TodayArgs {
  organizationId: string;
  facilityId: string;
  departments: Department[];
  doctors: Doctor[];
  patients: Patient[];
}

/**
 * Today's OPD: appointments across the week, a live queue per doctor, and
 * visits for everyone already seen. This is what makes the dashboard move the
 * moment it opens (spec §5.1, §40).
 */
async function seedToday({
  organizationId,
  facilityId,
  departments,
  doctors,
  patients,
}: TodayArgs) {
  const byCode = new Map(departments.map((d) => [d.code, d]));
  const now = new Date();

  const appointments: Prisma.AppointmentCreateManyInput[] = [];
  const queues: Prisma.QueueCreateManyInput[] = [];
  const entries: Prisma.QueueEntryCreateManyInput[] = [];
  const visits: Prisma.VisitCreateManyInput[] = [];
  const consultations: Prisma.ConsultationCreateManyInput[] = [];
  const vitals: Prisma.VitalCreateManyInput[] = [];

  let visitSeq = HISTORICAL_VISIT_COUNT;

  // A pool of patients for today, so the same person is not queued twice.
  const todaysPatients = random.sample(patients, 60);
  let patientCursor = 0;
  const nextPatient = () => todaysPatients[patientCursor++ % todaysPatients.length];

  for (const [doctorIndex, doctor] of doctors.entries()) {
    const department = byCode.get(doctor.department)!;
    const queueId = id("que");

    // The lead doctor has a full, busy queue. The others are lighter.
    const isLead = doctorIndex === 0;
    const completedCount = isLead ? 15 : random.int(4, 9);
    const waitingCount = isLead ? 7 : random.int(1, 4);
    const hasActive = isLead || random.chance(0.6);

    let tokenSeq = 0;
    let position = 0;
    // Anchor the session on the clock, not on a fixed 09:30 start: the block
    // of completed consultations ends about now, the active one is in
    // progress, and the people waiting joined in the last few minutes. Seeding
    // at any hour then produces a queue that looks like a real one.
    const sessionStart = new Date(
      Math.max(
        minutesAfter(now, -(completedCount * doctor.consultationMinutes)).getTime(),
        at(TODAY, 8, 0).getTime(),
      ),
    );
    let slotTime = sessionStart;

    const pushEntry = (
      status: QueueEntryStatus,
      opts: { waitMinutes?: number; priority?: QueuePriority } = {},
    ) => {
      tokenSeq += 1;
      position += 1;
      const patient = nextPatient();
      const entryId = id("qe");
      const appointmentId = id("apt");

      const scheduledStart = new Date(slotTime);
      const scheduledEnd = minutesAfter(scheduledStart, doctor.consultationMinutes);
      slotTime = scheduledEnd;

      const completed = status === QueueEntryStatus.COMPLETED;
      const inConsultation = status === QueueEntryStatus.IN_CONSULTATION;

      // A patient still waiting joined `waitMinutes` ago; one already seen
      // arrived shortly before their slot.
      const joinedAt =
        opts.waitMinutes !== undefined
          ? minutesAfter(now, -opts.waitMinutes)
          : minutesAfter(scheduledStart, -random.int(5, 20));
      const startedAt = completed || inConsultation ? scheduledStart : null;
      const completedAt = completed
        ? minutesAfter(scheduledStart, doctor.consultationMinutes)
        : null;

      appointments.push({
        id: appointmentId,
        organizationId,
        facilityId,
        departmentId: department.id,
        patientId: patient.id,
        doctorId: doctor.doctorId,
        scheduledStart,
        scheduledEnd,
        durationMinutes: doctor.consultationMinutes,
        type: random.chance(0.35) ? AppointmentType.FOLLOW_UP : AppointmentType.NEW_CONSULTATION,
        status: completed
          ? AppointmentStatus.COMPLETED
          : inConsultation
            ? AppointmentStatus.IN_CONSULTATION
            : AppointmentStatus.WAITING,
        source: random.pick([BookingSource.FRONT_DESK, BookingSource.ONLINE, BookingSource.PHONE]),
        reason: random.pick(COMPLAINTS[doctor.department]),
        checkedInAt: joinedAt,
        startedAt,
        completedAt,
        createdAt: dayOffset(TODAY, -random.int(1, 14)),
      });

      entries.push({
        id: entryId,
        queueId,
        patientId: patient.id,
        appointmentId,
        token: `${doctor.tokenPrefix}${String(tokenSeq).padStart(3, "0")}`,
        tokenSeq,
        status,
        priority: opts.priority ?? QueuePriority.NORMAL,
        position,
        joinedAt,
        vitalsAt: status === QueueEntryStatus.WAITING ? null : minutesAfter(joinedAt, random.int(3, 9)),
        calledAt: startedAt,
        startedAt,
        completedAt,
        waitMinutes: opts.waitMinutes ?? null,
      });

      // Everyone already called has a visit; those still waiting do not yet.
      if (completed || inConsultation) {
        visitSeq += 1;
        const visitId = id("vis");
        const consultationId = id("cons");
        const complaint = random.pick(COMPLAINTS[doctor.department]);

        visits.push({
          id: visitId,
          organizationId,
          facilityId,
          departmentId: department.id,
          patientId: patient.id,
          doctorId: doctor.doctorId,
          appointmentId,
          queueEntryId: entryId,
          visitNumber: sequenceNo("V", visitSeq),
          stage: completed ? PatientFlowStage.COMPLETED : PatientFlowStage.WITH_DOCTOR,
          status: completed ? VisitStatus.COMPLETED : VisitStatus.OPEN,
          startedAt: startedAt ?? scheduledStart,
          completedAt,
          chiefComplaint: complaint,
        });

        consultations.push({
          id: consultationId,
          organizationId,
          visitId,
          patientId: patient.id,
          doctorId: doctor.doctorId,
          chiefComplaint: complaint,
          symptoms: completed ? "Reviewed in consultation." : null,
          examination: completed ? "Systemic examination unremarkable." : null,
          assessment: completed ? complaint : null,
          plan: completed ? "Symptomatic management. Review if not settling." : null,
          // The in-progress consultation is an unsigned draft — exactly what
          // the doctor returns to when they open the workspace.
          status: completed ? ConsultationStatus.SIGNED : ConsultationStatus.DRAFT,
          signedAt: completedAt,
          signedByName: completed ? doctor.name : null,
          draftSavedAt: completed ? null : minutesAfter(now, -random.int(1, 6)),
          createdAt: startedAt ?? scheduledStart,
        });

        vitals.push({
          id: id("vit"),
          visitId,
          patientId: patient.id,
          heightCm: random.int(140, 185),
          weightKg: random.int(42, 96),
          temperatureC: (365 + random.int(0, 20)) / 10,
          pulseBpm: random.int(62, 98),
          respiratoryRate: random.int(12, 20),
          systolicBp: random.int(104, 150),
          diastolicBp: random.int(66, 94),
          spo2: random.int(95, 100),
          recordedAt: minutesAfter(joinedAt, random.int(3, 9)),
        });
      }
    };

    for (let i = 0; i < completedCount; i += 1) pushEntry(QueueEntryStatus.COMPLETED);
    if (hasActive) pushEntry(QueueEntryStatus.IN_CONSULTATION);
    for (let i = 0; i < waitingCount; i += 1) {
      pushEntry(
        random.chance(0.25) ? QueueEntryStatus.VITALS : QueueEntryStatus.WAITING,
        {
          waitMinutes: random.int(4, 26),
          priority: random.chance(0.1) ? QueuePriority.PRIORITY : QueuePriority.NORMAL,
        },
      );
    }

    queues.push({
      id: queueId,
      organizationId,
      facilityId,
      departmentId: department.id,
      doctorId: doctor.doctorId,
      date: TODAY,
      status: QueueStatus.OPEN,
      tokenPrefix: doctor.tokenPrefix,
      lastTokenSeq: tokenSeq,
      counterLabel: `Counter ${doctorIndex + 1}`,
      roomLabel: `Room ${101 + doctorIndex}`,
    });
  }

  // Upcoming appointments fill the rest of the week, so the schedule and the
  // appointments screen have a future as well as a today. These are additional
  // to the ones already created for today's queue.
  for (let i = 0; i < APPOINTMENT_COUNT; i += 1) {
    const doctor = random.pick(doctors);
    const department = byCode.get(doctor.department)!;
    const patient = random.pick(patients);
    const dayShift = random.int(1, 6);
    const scheduledStart = at(dayOffset(TODAY, dayShift), random.int(9, 19), random.pick([0, 15, 30, 45]));

    appointments.push({
      id: id("apt"),
      organizationId,
      facilityId,
      departmentId: department.id,
      patientId: patient.id,
      doctorId: doctor.doctorId,
      scheduledStart,
      scheduledEnd: minutesAfter(scheduledStart, doctor.consultationMinutes),
      durationMinutes: doctor.consultationMinutes,
      type: random.chance(0.4) ? AppointmentType.FOLLOW_UP : AppointmentType.NEW_CONSULTATION,
      status: AppointmentStatus.SCHEDULED,
      source: random.pick([BookingSource.ONLINE, BookingSource.FRONT_DESK, BookingSource.PHONE]),
      reason: random.pick(COMPLAINTS[doctor.department]),
      createdAt: dayOffset(TODAY, -random.int(0, 10)),
    });
  }

  await prisma.appointment.createMany({ data: appointments });
  await prisma.queue.createMany({ data: queues });
  await prisma.queueEntry.createMany({ data: entries });
  await prisma.visit.createMany({ data: visits });
  await prisma.consultation.createMany({ data: consultations });
  await prisma.vital.createMany({ data: vitals });

  console.log(
    `  today: ${queues.length} queues, ${entries.length} tokens, ${appointments.length} appointments`,
  );
}

async function seedFollowUpsAndFeedback({
  organizationId,
  doctors,
  patients,
  history,
}: {
  organizationId: string;
  doctors: Doctor[];
  patients: Patient[];
  history: HistoryRecord[];
}) {
  // Spec §42 — overdue, due today and upcoming, so the queue has all three.
  const buckets = [
    { count: 2, offsetRange: [-9, -2], status: FollowUpStatus.PENDING },
    { count: 3, offsetRange: [0, 0], status: FollowUpStatus.PENDING },
    { count: 3, offsetRange: [1, 10], status: FollowUpStatus.SCHEDULED },
    { count: 8, offsetRange: [-60, -12], status: FollowUpStatus.COMPLETED },
    { count: 4, offsetRange: [-40, -15], status: FollowUpStatus.MISSED },
  ];

  const sources = random.sample(history, FOLLOW_UP_COUNT);
  const followUps: Prisma.FollowUpCreateManyInput[] = [];
  let cursor = 0;

  for (const bucket of buckets) {
    for (let i = 0; i < bucket.count && cursor < sources.length; i += 1, cursor += 1) {
      const source = sources[cursor];
      const dueDate = at(
        dayOffset(TODAY, random.int(bucket.offsetRange[0], bucket.offsetRange[1])),
        random.int(9, 18),
        random.pick([0, 30]),
      );

      followUps.push({
        id: id("fu"),
        organizationId,
        patientId: source.patientId,
        doctorId: source.doctorId,
        visitId: source.visitId,
        dueDate,
        reason: random.pick([
          "Review response to treatment",
          "Repeat investigations",
          "Post-procedure review",
          "Medication titration",
          "Symptom review",
        ]),
        status: bucket.status,
        reminderSentAt:
          bucket.status === FollowUpStatus.PENDING ? null : minutesAfter(dueDate, -1440),
        completedAt: bucket.status === FollowUpStatus.COMPLETED ? dueDate : null,
      });
    }
  }

  await prisma.followUp.createMany({ data: followUps });

  // Spec §15 — feedback collected after completed consultations.
  const feedbackSources = random.sample(history, 40);
  await prisma.feedback.createMany({
    data: feedbackSources.map((source) => {
      const responded = random.chance(0.65);
      const requestedAt = minutesAfter(source.startedAt, 120);
      // Ratings skew high, as real post-consultation feedback does.
      const rating = random.pick([5, 5, 5, 4, 4, 4, 3, 5, 4, 2]);

      return {
        id: id("fb"),
        organizationId,
        patientId: source.patientId,
        doctorId: source.doctorId,
        visitId: source.visitId,
        rating: responded ? rating : null,
        comment: responded && random.chance(0.4)
          ? random.pick([
              "Doctor explained everything clearly.",
              "Waiting time was longer than expected.",
              "Very satisfied with the consultation.",
              "Staff were helpful and polite.",
              "Would have liked more time to ask questions.",
            ])
          : null,
        requestedAt,
        respondedAt: responded ? minutesAfter(requestedAt, random.int(10, 2880)) : null,
        reviewRequested: responded && rating >= 4,
        reviewPlatform: responded && rating >= 4 ? "google" : null,
      };
    }),
  });

  void doctors;
  void patients;
  console.log(`  ${followUps.length} follow-ups, ${feedbackSources.length} feedback records`);
}

async function seedCommunications({
  organizationId,
  patients,
}: {
  organizationId: string;
  patients: Patient[];
}) {
  const templates = await prisma.messageTemplate.findMany({
    where: { organizationId },
    select: { id: true, key: true, channel: true, category: true, body: true, subject: true },
  });

  const messages: Prisma.MessageCreateManyInput[] = [];

  for (let i = 0; i < MESSAGE_COUNT; i += 1) {
    const template = random.pick(templates);
    const patient = random.pick(patients);
    const createdAt = minutesAfter(new Date(), -random.int(5, 60 * 24 * 21));

    // Delivery outcomes weighted the way a real gateway reports them.
    const roll = random.next();
    const status =
      roll < 0.58
        ? MessageStatus.READ
        : roll < 0.84
          ? MessageStatus.DELIVERED
          : roll < 0.93
            ? MessageStatus.SENT
            : roll < 0.97
              ? MessageStatus.FAILED
              : MessageStatus.PENDING;

    const sentAt = status === MessageStatus.PENDING ? null : minutesAfter(createdAt, 1);
    const deliveredAt =
      status === MessageStatus.DELIVERED || status === MessageStatus.READ
        ? minutesAfter(createdAt, 2)
        : null;

    messages.push({
      id: id("msg"),
      organizationId,
      patientId: patient.id,
      templateId: template.id,
      channel: template.channel,
      category: template.category,
      status,
      toAddress:
        template.channel === MessageChannel.EMAIL
          ? (patient.email ?? `${patient.mrn.toLowerCase()}@example.demo`)
          : patient.phone,
      subject: template.subject,
      body: template.body
        .replace(/\{\{patientName\}\}/g, patient.firstName)
        .replace(/\{\{doctorName\}\}/g, "Dr. Ananya Rao")
        .replace(/\{\{[a-zA-Z]+\}\}/g, "—"),
      providerName:
        template.channel === MessageChannel.WHATSAPP
          ? "meta-cloud-api"
          : template.channel === MessageChannel.SMS
            ? "msg91"
            : "resend",
      providerRef: `prov_${id("ref")}`,
      failureReason:
        status === MessageStatus.FAILED
          ? random.pick([
              "Recipient not reachable on WhatsApp",
              "Provider temporarily unavailable",
              "Invalid mobile number",
            ])
          : null,
      attemptCount: status === MessageStatus.FAILED ? random.int(1, 3) : 1,
      queuedAt: createdAt,
      sentAt,
      deliveredAt,
      readAt: status === MessageStatus.READ ? minutesAfter(createdAt, random.int(3, 240)) : null,
      failedAt: status === MessageStatus.FAILED ? minutesAfter(createdAt, 2) : null,
      createdAt,
    });
  }

  await prisma.message.createMany({ data: messages });
  console.log(`  ${messages.length} communication events`);
}

async function seedNotificationsAndAudit({
  organizationId,
  doctors,
  staff,
  patients,
}: {
  organizationId: string;
  doctors: Doctor[];
  staff: Staff[];
  patients: Patient[];
}) {
  const lead = doctors[0];
  const now = new Date();

  /** Spec §20 — one of each priority level. */
  await prisma.notification.createMany({
    data: [
      {
        id: id("ntf"),
        organizationId,
        userId: lead.userId,
        level: NotificationLevel.ALERT,
        title: "Queue exceeding configured capacity",
        body: "General Medicine has 7 patients waiting against a threshold of 6.",
        linkHref: "/doctor/queue",
        createdAt: minutesAfter(now, -6),
      },
      {
        id: id("ntf"),
        organizationId,
        userId: lead.userId,
        level: NotificationLevel.IMPORTANT,
        title: "Patient waiting beyond threshold",
        body: "A token in your queue has been waiting longer than 20 minutes.",
        linkHref: "/doctor/queue",
        createdAt: minutesAfter(now, -13),
      },
      {
        id: id("ntf"),
        organizationId,
        userId: lead.userId,
        level: NotificationLevel.AI,
        title: "Pre-consultation brief ready",
        body: "Prepared from recorded visits. Review before you open the consultation.",
        linkHref: "/doctor/queue",
        createdAt: minutesAfter(now, -18),
      },
      {
        id: id("ntf"),
        organizationId,
        userId: lead.userId,
        level: NotificationLevel.NORMAL,
        title: "New appointment booked",
        body: "A follow-up was booked into your schedule for later this week.",
        linkHref: "/doctor/appointments",
        readAt: minutesAfter(now, -40),
        createdAt: minutesAfter(now, -62),
      },
    ],
  });

  /** Spec §30 — a traceable trail for the events that matter. */
  const admin = staff.find((s) => s.role === Role.HOSPITAL_ADMIN)!;
  const samplePatients = random.sample(patients, 6);

  await prisma.auditLog.createMany({
    data: [
      {
        id: id("aud"),
        organizationId,
        userId: lead.userId,
        action: AuditAction.LOGIN,
        entityType: "User",
        entityId: lead.userId,
        summary: `${lead.name} signed in`,
        createdAt: minutesAfter(now, -190),
      },
      ...samplePatients.map((patient, index) => ({
        id: id("aud"),
        organizationId,
        userId: lead.userId,
        action: AuditAction.CONSULTATION_SIGNED,
        entityType: "Consultation",
        entityId: null,
        summary: `Signed consultation · Patient ${patient.mrn}`,
        metadata: { patientMrn: patient.mrn },
        createdAt: minutesAfter(now, -(20 + index * 17)),
      })),
      {
        id: id("aud"),
        organizationId,
        userId: admin.userId,
        action: AuditAction.INTEGRATION_CHANGED,
        entityType: "Integration",
        summary: "Lab Information System credentials updated",
        createdAt: minutesAfter(now, -260),
      },
      {
        id: id("aud"),
        organizationId,
        userId: admin.userId,
        action: AuditAction.PERMISSION_CHANGED,
        entityType: "RolePermission",
        summary: "Receptionist granted analytics access",
        createdAt: minutesAfter(now, -1400),
      },
      {
        id: id("aud"),
        organizationId,
        userId: lead.userId,
        action: AuditAction.AI_OUTPUT_GENERATED,
        entityType: "AIAction",
        summary: "Pre-consultation brief generated",
        createdAt: minutesAfter(now, -18),
      },
    ],
  });

  /**
   * One AI action, awaiting review. It exists so the safety contract in §10 is
   * visible in the data, not just the UI: nothing reaches the clinical record
   * without a reviewed, accepted row here.
   */
  const brief = samplePatients[0];
  await prisma.aIAction.create({
    data: {
      id: id("aia"),
      organizationId,
      userId: lead.userId,
      patientId: brief.id,
      type: AIActionType.PRE_CONSULTATION_BRIEF,
      status: AIActionStatus.AWAITING_REVIEW,
      input: { patientMrn: brief.mrn, reason: "Follow-up consultation" },
      output: {
        reasonForVisit: "Follow-up consultation",
        recentHistory: [
          "Previous consultation recorded",
          "Prescription generated",
          "Follow-up requested",
        ],
        openItems: ["Follow-up due today", "Recent lab report available"],
        suggestedReview:
          "Review the latest uploaded lab report before finalizing today's note.",
      },
      sources: [
        { type: "Visit", label: "Consultation on file" },
        { type: "LabReport", label: "Lab report on file" },
      ],
      provider: "demo",
      model: "seeded-example",
      createdAt: minutesAfter(now, -18),
    },
  });

  console.log("  notifications, audit trail and one AI action awaiting review");
}

async function summarise(organizationId: string) {
  const [
    patients,
    visits,
    appointments,
    queueEntries,
    consultations,
    prescriptions,
    labReports,
    followUps,
    messages,
  ] = await Promise.all([
    prisma.patient.count({ where: { organizationId } }),
    prisma.visit.count({ where: { organizationId } }),
    prisma.appointment.count({ where: { organizationId } }),
    prisma.queueEntry.count({ where: { queue: { organizationId } } }),
    prisma.consultation.count({ where: { organizationId } }),
    prisma.prescription.count({ where: { patient: { organizationId } } }),
    prisma.labReport.count({ where: { patient: { organizationId } } }),
    prisma.followUp.count({ where: { organizationId } }),
    prisma.message.count({ where: { organizationId } }),
  ]);

  console.log("\nSeed complete:");
  console.table({
    patients,
    visits,
    consultations,
    appointments,
    queueEntries,
    prescriptions,
    labReports,
    followUps,
    messages,
  });
  console.log(`\nSign in with any demo account, password: ${DEMO_PASSWORD}`);
  console.log("  ananya.rao@aadrique.demo   doctor");
  console.log("  frontdesk@aadrique.demo    receptionist");
  console.log("  nurse@aadrique.demo        nurse");
  console.log("  admin@aadrique.demo        hospital admin\n");
}

main()
  .catch((error) => {
    console.error("\nSeed failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
