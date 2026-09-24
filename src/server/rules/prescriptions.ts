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
