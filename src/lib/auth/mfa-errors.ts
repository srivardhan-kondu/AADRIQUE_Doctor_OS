import { CredentialsSignin } from "next-auth";

/**
 * Spec §31 — why a sign-in with the right password still did not finish.
 * The codes reach the sign-in form, which then asks for the authenticator
 * code; they are only ever raised after the password was accepted.
 */

export class MfaRequired extends CredentialsSignin {
  code = "mfa_required";
}

export class MfaInvalid extends CredentialsSignin {
  code = "mfa_invalid";
}
