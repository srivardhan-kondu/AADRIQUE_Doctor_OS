import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, toCsv } from "@/lib/csv";

/** Spec §30 — exports must not become an injection path. */

describe("csv", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    assert.equal(csvCell('Rao "Ravi" K'), '"Rao ""Ravi"" K"');
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(42), '"42"');
  });

  it("neutralises cells a spreadsheet would run as a formula", () => {
    for (const attack of ["=HYPERLINK(\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1"]) {
      assert.ok(csvCell(attack).startsWith(`"'`), attack);
    }
    // An ordinary phone number with a plus sign is still readable.
    assert.equal(csvCell("+919876543210"), `"'+919876543210"`);
  });

  it("writes a header, CRLF rows and a UTF-8 BOM", () => {
    const csv = toCsv(["Name", "Age"], [["Aarti", 34], ["Élodie", null]]);
    assert.ok(csv.startsWith("﻿"));
    assert.equal(
      csv.slice(1),
      '"Name","Age"\r\n"Aarti","34"\r\n"Élodie",""\r\n',
    );
  });
});
