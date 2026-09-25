/**
 * Add-ons — the parts of the product a clinic licenses on top of the OPD core.
 *
 * The core (queue, appointments, patients, consultations, prescriptions) is
 * always on. Each add-on is switched on per organization by AADRIQUE — with
 * `npm run org:add-ons` — never from inside the clinic's own admin screens, so
 * a clinic cannot unlock what it has not bought.
 *
 * Stored as `Organization.modules.addOns`. Anything missing or malformed reads
 * as locked: an add-on is on only when it was deliberately turned on.
 *
 * Pure and client-safe, so the shell can mark a locked nav item.
 */

export const ADD_ONS = {
  followUps: {
    label: "Follow-up tracking",
    description:
      "Upcoming return visits, reminders sent ahead of time, completion rates and patients who have lapsed.",
  },
  messaging: {
    label: "Messages inbox",
    description:
      "One inbox across WhatsApp, SMS and email — every conversation with a patient, with delivery receipts and replies.",
  },
  analytics: {
    label: "Analytics",
    description:
      "Patients seen per day, consultation and wait times, completion, no-show and follow-up rates against the previous period.",
  },
  aiCopilot: {
    label: "AI Copilot",
    description:
      "Patient summaries, search across history in plain language and answers from your hospital's own documents — each with its sources.",
  },
} as const;

export type AddOn = keyof typeof ADD_ONS;

export const ADD_ON_KEYS = Object.keys(ADD_ONS) as AddOn[];

export type AddOnState = Record<AddOn, boolean>;

/** Reads `Organization.modules`; only an explicit `true` unlocks. */
export function readAddOns(modules: unknown): AddOnState {
  const raw =
    modules && typeof modules === "object" && "addOns" in modules
      ? (modules as { addOns: unknown }).addOns
      : null;
  const flags = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return Object.fromEntries(
    ADD_ON_KEYS.map((key) => [key, flags[key] === true]),
  ) as AddOnState;
}

/** A copy of `modules` with the given add-ons switched on or off. */
export function writeAddOns(
  modules: unknown,
  changes: Partial<AddOnState>,
): Record<string, unknown> {
  const base =
    modules && typeof modules === "object" && !Array.isArray(modules)
      ? { ...(modules as Record<string, unknown>) }
      : {};
  return { ...base, addOns: { ...readAddOns(modules), ...changes } };
}

/** How many messages a clinic without the inbox add-on sees, as a preview. */
export const MESSAGING_PREVIEW_LIMIT = 2;

/** How the clinic runs its OPD — configuration, not a licence. */
export interface OpdSettings {
  /**
   * Patients pass through a vitals station before the doctor. Off by default:
   * many clinics do not record vitals first, and a step nobody updates only
   * holds the line up.
   */
  vitalsStep: boolean;
}

export function readOpdSettings(settings: unknown): OpdSettings {
  const flags =
    settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  return { vitalsStep: flags.vitalsStep === true };
}
