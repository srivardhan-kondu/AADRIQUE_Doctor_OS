/**
 * Spec §31 — what an uploaded file really is, read from its first bytes.
 *
 * The browser's declared content type and the file's extension are both the
 * uploader's claim. Only these four formats are accepted, and only when the
 * bytes agree, so an HTML page renamed to `report.pdf` is refused rather than
 * stored and later served.
 */

export const ACCEPTED_TYPES = {
  "application/pdf": "PDF",
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/webp": "WebP image",
} as const;

export type AcceptedType = keyof typeof ACCEPTED_TYPES;

/** Uploads stay under Vercel's 4.5 MB request limit, with room for the form. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

export function sniffFileType(bytes: Uint8Array): AcceptedType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp"; // RIFF....WEBP
  }
  return null;
}

/**
 * A file name safe to store and to put in a Content-Disposition header:
 * no path, no control or quote characters, at most 120 characters.
 */
export function safeFileName(name: string, type: AcceptedType): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"\;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (cleaned && cleaned !== "." && cleaned !== "..") return cleaned;
  const ext = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[type];
  return `document.${ext}`;
}
