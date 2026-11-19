import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPassages } from "@/server/rules/knowledge";

/** Spec §9 — a clinic document is split into passages the assistant can cite. */

describe("toPassages", () => {
  it("splits on blank lines and tidies whitespace", () => {
    const text =
      "The first paragraph\nwraps   onto a second line.\r\n\r\nThe second paragraph stands alone.";
    assert.deepEqual(toPassages(text, 100), [
      "The first paragraph wraps onto a second line.",
      "The second paragraph stands alone.",
    ]);
  });

  it("joins a heading onto the paragraph that follows it", () => {
    const passages = toPassages("Refunds\n\nA refund is issued within seven days of a cancelled visit.", 200);
    assert.deepEqual(passages, ["Refunds\n\nA refund is issued within seven days of a cancelled visit."]);
  });

  it("keeps full-sized paragraphs apart", () => {
    const a = "a".repeat(80);
    const b = "b".repeat(80);
    assert.deepEqual(toPassages(`${a}\n\n${b}`, 100), [a, b]);
  });

  it("splits a long paragraph at sentence ends, losing nothing", () => {
    const sentence = "This sentence is exactly forty chars ok. ";
    const text = sentence.repeat(6).trim();
    const passages = toPassages(text, 100);
    assert.ok(passages.length >= 3);
    assert.ok(passages.every((p) => p.length <= 100));
    assert.equal(passages.join(" ").replace(/\s+/g, " "), text);
  });

  it("cuts a single sentence longer than the limit rather than dropping it", () => {
    const text = "x".repeat(250);
    const passages = toPassages(text, 100);
    assert.equal(passages.join(""), text);
    assert.ok(passages.every((p) => p.length <= 100));
  });

  it("returns nothing for blank text", () => {
    assert.deepEqual(toPassages("  \n\n \n"), []);
  });
});
