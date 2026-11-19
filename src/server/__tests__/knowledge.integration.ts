import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { searchKnowledgeBase } from "@/server/services/ai/retrieval";
import {
  addKnowledgeDocument,
  listKnowledgeDocuments,
  removeKnowledgeDocument,
} from "@/server/services/knowledge";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** Spec §9 — a clinic's own documents, answerable by the assistant once added. */

const configured = Boolean(process.env.DATABASE_URL);

const POLICY = `Refund policy

A consultation fee is refunded in full when the clinic cancels the appointment.

A patient who cancels less than two hours before the visit is refunded half the fee.`;

describe("Knowledge base", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;

  before(async () => {
    clinic = await createTenant("knowledge");
    other = await createTenant("knowledge-other");
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("makes an added document answerable at once, for that clinic only", async () => {
    const added = await addKnowledgeDocument(clinic!.admin, {
      title: "Refunds",
      category: "Billing",
      text: POLICY,
    });
    assert.ok(added.passages >= 1);

    const [row] = await listKnowledgeDocuments(clinic!.admin);
    assert.equal(row.title, "Refunds");
    assert.equal(row.answerable, true);

    const found = await searchKnowledgeBase(clinic!.doctor, "refund cancels fee");
    assert.ok(found.some((s) => s.label === "Refunds" && s.detail.includes("half the fee")));

    assert.deepEqual(await searchKnowledgeBase(other!.doctor, "refund cancels fee"), []);
    assert.deepEqual(await listKnowledgeDocuments(other!.admin), []);
  });

  it("refuses a doctor, and an empty document", async () => {
    await assert.rejects(
      addKnowledgeDocument(clinic!.doctor, { title: "Mine", category: null, text: POLICY }),
      { name: "PermissionError" },
    );
    const empty = await rejection(
      addKnowledgeDocument(clinic!.admin, { title: "Blank", category: null, text: " \n\n " }),
    );
    assert.equal(empty.code, "INVALID_STATE");
  });

  it("removes a document, its passages and its stored text", async () => {
    const [row] = await listKnowledgeDocuments(clinic!.admin);
    const { storageKey } = await prisma.hospitalDocument.findUniqueOrThrow({
      where: { id: row.id },
      select: { storageKey: true },
    });

    // Another clinic cannot reach it.
    const missing = await rejection(removeKnowledgeDocument(other!.admin, row.id));
    assert.equal(missing.code, "NOT_FOUND");

    await removeKnowledgeDocument(clinic!.admin, row.id);

    assert.deepEqual(await searchKnowledgeBase(clinic!.doctor, "refund cancels fee"), []);
    assert.equal(await prisma.fileBlob.count({ where: { key: storageKey } }), 0);
    assert.equal(await prisma.documentChunk.count({ where: { documentId: row.id } }), 0);
  });
});
