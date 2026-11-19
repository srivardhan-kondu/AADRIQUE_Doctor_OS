/**
 * Spec §6 — consultation decisions with no I/O, shared by the services and the
 * consultation screen so both apply the same rule.
 */

/** The note's fields a doctor writes. The chief complaint is excluded below. */
export interface NoteText {
  chiefComplaint?: string | null;
  symptoms?: string | null;
  history?: string | null;
  examination?: string | null;
  assessment?: string | null;
  plan?: string | null;
  doctorNotes?: string | null;
}

/**
 * Has the doctor written anything that would be lost if the visit closed
 * unsigned? The chief complaint does not count: it is copied in from the
 * appointment's reason when the patient is called, before anyone has typed.
 */
export function hasWrittenNote(note: NoteText, prescriptionItems = 0): boolean {
  if (prescriptionItems > 0) return true;
  return [note.symptoms, note.history, note.examination, note.assessment, note.plan, note.doctorNotes].some(
    (value) => Boolean(value?.trim()),
  );
}

/** The review intervals offered on the consultation, in days. */
export const FOLLOW_UP_CHOICES = [
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
] as const;

/** A review `days` from `from`, as a local calendar day (midnight). */
export function followUpDueDate(from: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new RangeError("A follow-up is between 1 and 365 days away.");
  }
  const due = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return due;
}

/** How diagnoses read when they stand in as the assessment. */
export function assessmentFromDiagnoses(names: string[]): string {
  return names.join("; ");
}

/**
 * The assessment after the diagnosis list changes. An empty assessment, or one
 * that is still exactly the old diagnosis list, follows the diagnoses; one the
 * doctor has written themselves is never touched.
 */
export function syncAssessment(current: string | null | undefined, before: string[], after: string[]): string {
  const text = (current ?? "").trim();
  if (text === "" || text === assessmentFromDiagnoses(before)) {
    return assessmentFromDiagnoses(after);
  }
  return current ?? "";
}
