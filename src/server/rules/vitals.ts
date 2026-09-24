/**
 * Spec §5.1 + §6 — what a set of vitals may contain, and which readings a
 * doctor should see flagged.
 *
 * Limits are deliberately wide: they catch a mistyped reading (a
 * temperature of 370, a pulse of 7), never a genuinely abnormal one. What is
 * abnormal is flagged for the doctor, not refused.
 */

export interface VitalsReading {
  heightCm: number | null;
  weightKg: number | null;
  temperatureC: number | null;
  pulseBpm: number | null;
  respiratoryRate: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  spo2: number | null;
  bloodGlucose: number | null;
}

const LIMITS: Record<keyof VitalsReading, { label: string; min: number; max: number; unit: string }> = {
  heightCm: { label: "Height", min: 30, max: 250, unit: "cm" },
  weightKg: { label: "Weight", min: 0.5, max: 350, unit: "kg" },
  temperatureC: { label: "Temperature", min: 30, max: 45, unit: "°C" },
  pulseBpm: { label: "Pulse", min: 20, max: 250, unit: "bpm" },
  respiratoryRate: { label: "Respiratory rate", min: 4, max: 80, unit: "/min" },
  systolicBp: { label: "Systolic BP", min: 50, max: 300, unit: "mmHg" },
  diastolicBp: { label: "Diastolic BP", min: 20, max: 200, unit: "mmHg" },
  spo2: { label: "SpO₂", min: 50, max: 100, unit: "%" },
  bloodGlucose: { label: "Blood glucose", min: 10, max: 1000, unit: "mg/dL" },
};

/** Why these readings cannot be stored as typed, or null when they can. */
export function vitalsProblem(reading: VitalsReading): string | null {
  const entries = Object.entries(reading) as [keyof VitalsReading, number | null][];
  if (entries.every(([, value]) => value === null)) return "Enter at least one reading.";

  for (const [key, value] of entries) {
    if (value === null) continue;
    const limit = LIMITS[key];
    if (!Number.isFinite(value) || value < limit.min || value > limit.max) {
      return `${limit.label} of ${value} ${limit.unit} looks mistyped — expected ${limit.min}–${limit.max}.`;
    }
  }

  const { systolicBp, diastolicBp } = reading;
  if ((systolicBp === null) !== (diastolicBp === null)) {
    return "Blood pressure needs both numbers, systolic and diastolic.";
  }
  if (systolicBp !== null && diastolicBp !== null && systolicBp <= diastolicBp) {
    return "Systolic pressure must be higher than diastolic — check the order.";
  }
  return null;
}

/** Readings outside the usual adult range, named for the doctor. */
export function vitalsFlags(reading: Partial<VitalsReading>): string[] {
  const flags: string[] = [];
  const { temperatureC, pulseBpm, systolicBp, diastolicBp, spo2, respiratoryRate } = reading;
  if (temperatureC != null && temperatureC >= 38) flags.push("Fever");
  if (spo2 != null && spo2 < 94) flags.push("Low SpO₂");
  if ((systolicBp != null && systolicBp >= 140) || (diastolicBp != null && diastolicBp >= 90)) {
    flags.push("High BP");
  }
  if (systolicBp != null && systolicBp < 90) flags.push("Low BP");
  if (pulseBpm != null && (pulseBpm > 100 || pulseBpm < 50)) flags.push(pulseBpm > 100 ? "Fast pulse" : "Slow pulse");
  if (respiratoryRate != null && respiratoryRate > 24) flags.push("Fast breathing");
  return flags;
}

/** Body-mass index to one decimal, or null without both measurements. */
export function bmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}
