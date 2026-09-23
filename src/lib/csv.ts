/**
 * CSV for exports (spec §30).
 *
 * Every cell is quoted, and a cell that a spreadsheet would read as a formula
 * (=, +, -, @, tab or carriage return first) is prefixed with an apostrophe.
 * Patient-entered text such as a name is untrusted: `=HYPERLINK(...)` in a
 * name field must open as text, not run when an administrator opens the file.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const text =
    value instanceof Date ? value.toISOString() : String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(
  header: string[],
  rows: Array<Array<string | number | boolean | Date | null | undefined>>,
): string {
  // CRLF per RFC 4180, and a BOM so spreadsheet apps read UTF-8 names correctly.
  return (
    "﻿" +
    [header.map(csvCell), ...rows.map((row) => row.map(csvCell))]
      .map((cells) => cells.join(","))
      .join("\r\n") +
    "\r\n"
  );
}
