/**
 * Spec §23 + §32 — the AI abstraction.
 *
 * One interface in front of every provider. Feature code describes the task
 * and hands over the facts it has already retrieved; which model answers, or
 * whether a model is involved at all, is decided here.
 *
 * The shape of this layer follows spec §32's pipeline:
 *
 *   Doctor UI → AI service → orchestrator → retrieval → approved sources
 *   → provider → validation → doctor review → audit log
 *
 * Retrieval happens *before* the provider is called, and the retrieved facts
 * travel with the request as `sources`. That ordering is what makes spec §10
 * enforceable: a provider can only phrase what it was given, and anything it
 * says can be checked back against the source list.
 */

/**
 * One fact drawn from the patient record, with the row it came from.
 *
 * Spec §8: "cite the originating patient-record events internally so the
 * doctor can inspect the source". Every generated surface carries these, and
 * the UI links each one back to the record.
 */
export interface AISource {
  /** Stable id for the citation, referenced from generated text as [S1]. */
  ref: string;
  kind:
    | "CONSULTATION"
    | "PRESCRIPTION"
    | "LAB_REPORT"
    | "VITAL"
    | "APPOINTMENT"
    | "FOLLOW_UP"
    | "ALLERGY"
    | "CONDITION"
    | "MESSAGE"
    | "DOCUMENT";
  label: string;
  /** The fact itself, already read from the database. */
  detail: string;
  at: string | null;
  /** Where the doctor goes to see the original. */
  href: string | null;
}

export type AITaskType =
  | "PRE_CONSULTATION_BRIEF"
  | "PATIENT_SUMMARY"
  | "CONSULTATION_NOTE_DRAFT"
  | "VOICE_TO_NOTE"
  | "FOLLOW_UP_MESSAGE"
  | "HISTORY_SEARCH"
  | "KNOWLEDGE_ANSWER"
  | "MISSING_DOCUMENTATION";

export interface AIRequest {
  task: AITaskType;
  /** What the doctor asked for, in their words, when they asked in words. */
  instruction: string;
  /** The approved facts this answer may be built from. */
  sources: AISource[];
  /** Task-specific structured input, e.g. a dictated note. */
  input?: Record<string, unknown>;
  /** Hard ceiling on the answer, in characters, for the surfaces that need one. */
  maxCharacters?: number;
}

/** A section of generated output the UI renders as its own block. */
export interface AISection {
  heading: string;
  /** Plain lines. Bullets are lines; the view decides how to mark them. */
  lines: string[];
  /** Refs into `AIResult.sources` backing this section. */
  cites: string[];
}

export interface AIResult {
  sections: AISection[];
  /** The facts this answer was allowed to use, echoed back for the citation UI. */
  sources: AISource[];
  provider: string;
  model: string | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  /**
   * True when the answer was composed deterministically from the sources
   * rather than generated. The UI says so, because "assembled from your
   * records" and "written by a model" are different promises to a doctor.
   */
  grounded: boolean;
  /** Set when the provider declined or failed and a fallback answered. */
  note?: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string | null;
  complete(request: AIRequest): Promise<AIResult>;
}

/** Thrown when a provider cannot answer at all. */
export class AIError extends Error {
  constructor(message: string, readonly action?: string) {
    super(message);
    this.name = "AIError";
  }
}
