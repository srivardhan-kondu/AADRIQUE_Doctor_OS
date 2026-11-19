/**
 * Quick text that ships with the product: the routine findings and advice an
 * OPD doctor writes many times a day. A doctor inserts one with a click and
 * edits it; nothing is ever written into a note without that click. Each
 * doctor adds their own beside these (`src/server/services/favourites.ts`).
 */

export const PHRASE_FIELDS = [
  "symptoms",
  "history",
  "examination",
  "assessment",
  "plan",
  "advice",
] as const;

export type PhraseField = (typeof PHRASE_FIELDS)[number];

export const BUILT_IN_PHRASES: Record<PhraseField, string[]> = {
  symptoms: [],
  history: [
    "No known history of diabetes, hypertension, asthma or tuberculosis.",
    "Compliant with medication since the last visit.",
  ],
  examination: [
    "Conscious, oriented, afebrile. No pallor, icterus, cyanosis, clubbing, lymphadenopathy or oedema.",
    "CVS: S1 S2 heard, no murmur.",
    "RS: bilateral air entry equal, chest clear.",
    "P/A: soft, non-tender, no organomegaly.",
    "CNS: no focal neurological deficit.",
  ],
  assessment: [],
  plan: [
    "Continue current medication.",
    "Review after one week, or earlier if symptoms worsen.",
  ],
  advice: [
    "Take medicines after food.",
    "Plenty of oral fluids and rest.",
    "Return at once if there is high fever, breathlessness, chest pain or persistent vomiting.",
  ],
};
