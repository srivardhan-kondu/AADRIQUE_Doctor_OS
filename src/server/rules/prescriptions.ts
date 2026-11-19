/**
 * Spec §6 — the allergy check on a prescription, with no database attached.
 *
 * A medicine is flagged when its name mentions a recorded allergy
 * ("Amoxicillin" for a penicillin allergy is not caught — that needs a drug
 * database, and a doctor; this catches the recorded substance by name). Short
 * words are ignored on both sides so "Tab" or "Syp" never match by accident.
 * A flag is a warning shown to the doctor, never a silent block.
 */
export function allergyMatches(medicationName: string, substances: string[]): string[] {
  const name = medicationName.toLowerCase();
  const words = name.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);

  return substances.filter((s) => {
    const substance = s.toLowerCase().trim();
    if (substance.length < 4) return false;
    return name.includes(substance) || words.some((w) => substance.includes(w));
  });
}

/** The written-out frequencies the prescription offers. */
export const FREQUENCIES = [
  "Once daily (OD)",
  "Twice daily (BD)",
  "Three times daily (TDS)",
  "Four times daily (QID)",
  "At night (HS)",
  "When needed (SOS)",
] as const;

const ABBREVIATIONS: Record<string, string> = {
  od: FREQUENCIES[0],
  bd: FREQUENCIES[1],
  bid: FREQUENCIES[1],
  tds: FREQUENCIES[2],
  tid: FREQUENCIES[2],
  qid: FREQUENCIES[3],
  hs: FREQUENCIES[4],
  sos: FREQUENCIES[5],
  prn: FREQUENCIES[5],
};

const DOSE = String.raw`(?:\d{1,2}(?:\.\d)?|½|1\/2)`;
const PATTERN = new RegExp(`^${DOSE}(?:-${DOSE}){2,3}$`);

/**
 * Expands the shorthand doctors write — "bd", "tds", "1-0-1", "1-1-1-1" — into
 * what the patient reads. The dose pattern is kept, because the pharmacist
 * reads that, and the times are spelled out after it. Anything else is
 * returned as typed: this is a convenience, never a correction.
 */
export function expandFrequency(input: string): string {
  const typed = input.trim();
  const abbreviation = ABBREVIATIONS[typed.toLowerCase().replace(/\./g, "")];
  if (abbreviation) return abbreviation;

  const compact = typed.replace(/\s+/g, "");
  if (!PATTERN.test(compact)) return input;

  const doses = compact.split("-");
  const times =
    doses.length === 3 ? ["morning", "afternoon", "night"] : ["morning", "afternoon", "evening", "night"];
  const taken = times.filter((_, i) => !/^0+(\.0)?$/.test(doses[i]!));
  if (taken.length === 0) return input;

  const spoken =
    taken.length === 1
      ? taken[0]!
      : `${taken.slice(0, -1).join(", ")} and ${taken[taken.length - 1]}`;
  return `${compact} (${spoken})`;
}

/** A prescription line, as copied between prescriptions. */
export interface PrescriptionLine {
  medicationId: string | null;
  medicationName: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  durationDays: number | null;
  instructions: string | null;
}

/**
 * Adds `incoming` lines to `current`, skipping any medicine already on it (by
 * name, ignoring case) and stopping at `limit`. Repeating a prescription or
 * applying a set never duplicates a medicine the doctor has already written.
 */
export function mergePrescriptionLines<T extends PrescriptionLine>(
  current: T[],
  incoming: PrescriptionLine[],
  limit = 20,
): { lines: PrescriptionLine[]; skipped: number } {
  const seen = new Set(current.map((l) => l.medicationName.trim().toLowerCase()).filter(Boolean));
  const lines: PrescriptionLine[] = [];
  let skipped = 0;
  for (const line of incoming) {
    const key = line.medicationName.trim().toLowerCase();
    if (!key || seen.has(key) || current.length + lines.length >= limit) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    lines.push(line);
  }
  return { lines, skipped };
}
