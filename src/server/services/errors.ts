/**
 * Structured service errors (spec §50).
 *
 * Services throw these; server actions translate them into a message the user
 * can act on (spec §38 — an error should say what to do next, never
 * "Something went wrong").
 */
export class ServiceError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_STATE"
      | "FORBIDDEN"
      | "VALIDATION",
    message: string,
    /** What the user should do about it. */
    readonly action?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function notFound(what: string): ServiceError {
  return new ServiceError("NOT_FOUND", `${what} was not found.`);
}

export function invalidState(message: string, action?: string): ServiceError {
  return new ServiceError("INVALID_STATE", message, action);
}

/**
 * Closing a visit would leave a note the doctor wrote unsigned (and its
 * prescription unissued). The caller decides: open the note, or go on and
 * leave it as a draft to sign later.
 */
export class UnsignedNoteError extends ServiceError {
  constructor(
    readonly visitId: string,
    readonly patientName: string,
  ) {
    super(
      "CONFLICT",
      `${patientName}'s note is not signed.`,
      "Sign it first, or continue and sign it later from Consultations.",
    );
    this.name = "UnsignedNoteError";
  }
}
