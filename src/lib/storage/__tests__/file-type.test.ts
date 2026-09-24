import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeFileName, sniffFileType } from "@/lib/storage/file-type";

/** Spec §31 — an upload is what its bytes say, not what its name claims. */

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffFileType", () => {
  it("recognises the accepted formats", () => {
    assert.equal(sniffFileType(text("%PDF-1.7\n...")), "application/pdf");
    assert.equal(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), "image/png");
    assert.equal(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
    assert.equal(sniffFileType(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")), "image/webp");
  });

  it("refuses anything else, whatever it is called", () => {
    assert.equal(sniffFileType(text("<html><script>alert(1)</script>")), null);
    assert.equal(sniffFileType(text("RIFF\u0000\u0000\u0000\u0000WAVE")), null);
    assert.equal(sniffFileType(new Uint8Array()), null);
  });
});

describe("safeFileName", () => {
  it("keeps the name, drops the path and header-breaking characters", () => {
    assert.equal(safeFileName("C:\\scans\\CBC report.pdf", "application/pdf"), "CBC report.pdf");
    assert.equal(safeFileName('x"; filename=evil.html', "application/pdf"), "x filename=evil.html");
    assert.equal(safeFileName("../..", "image/png"), "document.png");
  });
});
