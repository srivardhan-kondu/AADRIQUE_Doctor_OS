/**
 * Spec §9 — how a clinic's own document becomes passages the knowledge
 * assistant can quote.
 *
 * A passage is a paragraph, with any short line before it joined on, so each citation
 * points at a readable piece of the document rather than a whole page or a
 * stray line. A paragraph longer than the limit is split at sentence ends.
 */

export const MAX_DOCUMENT_CHARS = 100_000;
export const PASSAGE_TARGET_CHARS = 900;

function splitLong(paragraph: string, limit: number): string[] {
  if (paragraph.length <= limit) return [paragraph];

  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [paragraph];
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > limit) {
      pieces.push(current.trim());
      current = "";
    }
    // A single sentence longer than the limit is cut, never dropped.
    let rest = sentence;
    while (rest.length > limit) {
      pieces.push(rest.slice(0, limit).trim());
      rest = rest.slice(limit);
    }
    current += rest;
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

export function toPassages(text: string, limit = PASSAGE_TARGET_CHARS): string[] {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((p) => splitLong(p, limit));

  const passages: string[] = [];
  for (const paragraph of paragraphs) {
    const last = passages.at(-1);
    // A heading or a one-line paragraph joins what follows it.
    if (last !== undefined && last.length < limit / 4 && last.length + paragraph.length + 2 <= limit) {
      passages[passages.length - 1] = `${last}\n\n${paragraph}`;
    } else {
      passages.push(paragraph);
    }
  }
  return passages;
}
