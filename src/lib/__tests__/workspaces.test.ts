import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { landingFor, workspacesFor } from "@/lib/workspaces";

describe("landingFor", () => {
  it("sends a doctor home when the return link is the front desk", () => {
    // Left by a receptionist whose session ran out on this computer.
    assert.equal(landingFor("DOCTOR", "/reception"), "/doctor");
    assert.equal(landingFor("DOCTOR", "/reception/queue"), "/doctor");
    assert.equal(landingFor("DOCTOR", "/nurse"), "/doctor");
    assert.equal(landingFor("RECEPTIONIST", "/doctor/patients/p1"), "/reception");
  });

  it("keeps a return link in the person's own workspace", () => {
    assert.equal(landingFor("DOCTOR", "/doctor/queue"), "/doctor/queue");
    assert.equal(landingFor("HOSPITAL_ADMIN", "/reception/queue"), "/reception/queue");
    assert.equal(landingFor("DOCTOR", "/account/password"), "/account/password");
  });

  it("never leaves the site, and falls back to the role's home", () => {
    assert.equal(landingFor("NURSE", "https://elsewhere.example"), "/nurse");
    assert.equal(landingFor("NURSE", "//elsewhere.example"), "/nurse");
    assert.equal(landingFor("NURSE", null), "/nurse");
  });
});

describe("workspacesFor", () => {
  it("offers a doctor only the doctor's workspace", () => {
    assert.deepEqual(workspacesFor("DOCTOR"), ["doctor"]);
  });
});
