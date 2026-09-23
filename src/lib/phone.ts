/**
 * Spec §13 — one stored form per mobile number.
 *
 * An Indian mobile becomes `+91` and ten digits, however it was typed, so the
 * same person is found, deduplicated and matched to their WhatsApp replies.
 * Anything else (a landline, a foreign number) is kept as typed, trimmed.
 */
export function canonicalPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Indian mobiles begin 6–9; a ten-digit landline with its STD code does not.
  const mobile = (ten: string) => /^[6-9]\d{9}$/.test(ten);
  if (digits.length === 10 && mobile(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && mobile(digits.slice(2))) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && mobile(digits.slice(1))) return `+91${digits.slice(1)}`;
  return value.trim();
}
