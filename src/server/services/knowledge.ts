import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import { fileStore } from "@/lib/storage";
import type { RequestActor } from "@/server/context";
import { MAX_DOCUMENT_CHARS, toPassages } from "@/server/rules/knowledge";
import { writeAudit } from "./audit";
import { invalidState, notFound } from "./errors";

/**
 * Spec §9 — the clinic's own documents (SOPs, policies, fee schedules), which
 * the knowledge assistant answers from.
 *
 * An administrator adds a document as text. It is split into passages at
 * once, so it is answerable as soon as it is saved; removing it takes it out
 * of every future answer.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface KnowledgeDocumentRow {
  id: string;
  title: string;
  category: string | null;
  answerable: boolean;
  passages: number;
  updatedAt: Date;
}

export async function listKnowledgeDocuments(
  actor: RequestActor,
): Promise<KnowledgeDocumentRow[]> {
  assertPermission(actor, Permission.AI_MANAGE);

  const documents = await prisma.hospitalDocument.findMany({
    where: { ...tenantScope(actor), status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      category: true,
      approved: true,
      status: true,
      updatedAt: true,
      _count: { select: { chunks: true } },
    },
  });

  return documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    answerable: doc.approved && doc.status === "INDEXED",
    passages: doc._count.chunks,
    updatedAt: doc.updatedAt,
  }));
}

export async function addKnowledgeDocument(
  actor: RequestActor,
  input: { title: string; category: string | null; text: string },
): Promise<{ id: string; passages: number }> {
  assertPermission(actor, Permission.AI_MANAGE);

  if (input.text.length > MAX_DOCUMENT_CHARS) {
    throw invalidState(
      "That document is too long.",
      "Split it into smaller documents, one per topic.",
    );
  }

  const passages = toPassages(input.text);
  if (passages.length === 0) {
    throw invalidState("The document has no text.", "Paste or choose a file with some text in it.");
  }

  const bytes = new TextEncoder().encode(input.text);
  const storageKey = `${actor.organizationId}/knowledge/${randomUUID()}.txt`;
  const store = fileStore();
  await store.put(storageKey, bytes);

  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.hospitalDocument.create({
        data: {
          organizationId: actor.organizationId,
          title: input.title,
          category: input.category,
          storageKey,
          contentType: "text/plain",
          sizeBytes: bytes.byteLength,
          status: "INDEXED",
          // Added by an administrator, who is the one who approves.
          approved: true,
          uploadedById: actor.userId,
          indexedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.documentChunk.createMany({
        data: passages.map((content, chunkIndex) => ({
          documentId: document.id,
          chunkIndex,
          content,
          tokenCount: Math.ceil(content.length / 4),
          metadata: { title: input.title, category: input.category },
        })),
      });

      await writeAudit(tx, actor, {
        action: "RECORD_CREATED",
        entityType: "HospitalDocument",
        entityId: document.id,
        summary: `Added "${input.title}" to the knowledge base · ${passages.length} passages`,
      });

      return { id: document.id, passages: passages.length };
    }, TX_OPTIONS);
  } catch (error) {
    await store.delete(storageKey);
    throw error;
  }
}

export async function removeKnowledgeDocument(
  actor: RequestActor,
  documentId: string,
): Promise<{ title: string }> {
  assertPermission(actor, Permission.AI_MANAGE);

  const document = await prisma.hospitalDocument.findFirst({
    where: { id: documentId, ...tenantScope(actor) },
    select: { id: true, title: true, storageKey: true },
  });
  if (!document) throw notFound("Document");

  await prisma.$transaction(async (tx) => {
    // Passages go with it (cascade), so it is never quoted again.
    await tx.hospitalDocument.delete({ where: { id: document.id } });

    await writeAudit(tx, actor, {
      action: "RECORD_DELETED",
      entityType: "HospitalDocument",
      entityId: document.id,
      summary: `Removed "${document.title}" from the knowledge base`,
    });
  }, TX_OPTIONS);

  await fileStore().delete(document.storageKey);

  return { title: document.title };
}
