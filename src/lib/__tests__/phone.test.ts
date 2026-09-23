import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalPhone } from "@/lib/phone";

describe("canonicalPhone", () => {
  it("stores every way of typing an Indian mobile the same way", () => {
    for (const typed of ["9876543210", "98765 43210", "+91 98765-43210", "919876543210", "098765 43210"]) {
      assert.equal(canonicalPhone(typed), "+919876543210", typed);
    }
  });

  it("keeps other numbers as typed", () => {
    assert.equal(canonicalPhone(" +44 20 7946 0958 "), "+44 20 7946 0958");
    assert.equal(canonicalPhone("040 2345 678"), "040 2345 678");
  });
});
