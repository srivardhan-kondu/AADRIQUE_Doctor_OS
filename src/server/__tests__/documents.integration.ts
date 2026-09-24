import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import {
  listDocuments,
  markLabReviewed,
  readDocument,
  uploadDocument,
} from "@/server/services/documents";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** Spec §6 + §31 — uploads are checked, stored, scoped and audited. */

const configured = Boolean(process.env.DATABASE_URL);
const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

describe("Documents", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;
  let attachmentId = "";

  before(async () => {
    clinic = await createTenant("docs");
    other = await createTenant("docs-other");
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("stores a lab report, awaiting the doctor's review", async () => {
    const t = clinic!;
    ({ attachmentId } = await uploadDocument(t.doctor, {
      patientId: t.patientId,
      visitId: null,
      kind: "LAB_REPORT",
      title: "HbA1c",
      fileName: "../../etc/hba1c.pdf",
      bytes: pdf,
      abnormal: true,
      summary: "HbA1c 7.9%",
    }));

    const [doc] = await listDocuments(t.doctor, t.patientId);
    assert.equal(doc.name, "HbA1c");
    assert.equal(doc.fileName, "hba1c.pdf");
    assert.equal(doc.contentType, "application/pdf");
    assert.equal(doc.lab?.status, "RESULT_AVAILABLE");
    assert.equal(doc.lab?.abnormal, true);

    const file = await readDocument(t.doctor, attachmentId);
    assert.deepEqual(file.bytes, pdf);
    const opened = await prisma.auditLog.count({ where: { entityId: attachmentId, action: "RECORD_VIEWED" } });
    assert.equal(opened, 1, "opening a document is audited");

    await markLabReviewed(t.doctor, doc.lab!.id);
    const [reviewed] = await listDocuments(t.doctor, t.patientId);
    assert.equal(reviewed.lab?.status, "REVIEWED");
    assert.ok(reviewed.lab?.reviewedAt);
  });

  it("refuses a file that is not what it claims, and leaves nothing behind", async () => {
    const t = clinic!;
    const blobs = await prisma.fileBlob.count();
    const html = await rejection(
      uploadDocument(t.doctor, {
        patientId: t.patientId,
        visitId: null,
        kind: "DOCUMENT",
        title: "Report",
        fileName: "report.pdf",
        bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>"),
      }),
    );
    assert.equal(html.code, "VALIDATION");
    const tooBig = new Uint8Array(4 * 1024 * 1024 + 1);
    tooBig.set(pdf);
    assert.equal(
      (await rejection(uploadDocument(t.doctor, { patientId: t.patientId, visitId: null, kind: "DOCUMENT", title: "Big", fileName: "big.pdf", bytes: tooBig }))).code,
      "VALIDATION",
    );
    assert.equal(await prisma.fileBlob.count(), blobs);
  });

  it("keeps documents inside the clinic and away from the front desk", async () => {
    const t = clinic!;
    assert.equal((await rejection(readDocument(other!.doctor, attachmentId))).code, "NOT_FOUND");
    assert.equal(
      (await rejection(uploadDocument(other!.doctor, { patientId: t.patientId, visitId: null, kind: "DOCUMENT", title: "X", fileName: "x.pdf", bytes: pdf }))).code,
      "NOT_FOUND",
    );
    await assert.rejects(readDocument(t.reception, attachmentId), { name: "PermissionError" });
    await assert.rejects(listDocuments(t.reception, t.patientId), { name: "PermissionError" });
  });
});
