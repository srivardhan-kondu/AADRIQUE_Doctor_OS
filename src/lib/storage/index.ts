import "server-only";
import { prisma } from "@/lib/db";

/**
 * Spec §6 — where uploaded files live.
 *
 * Behind one small interface so the store can change (an S3 bucket, say)
 * without touching a service. The default keeps the bytes in Postgres: one
 * system to back up and restore, with the same access controls and tenancy
 * as the records the files belong to. Uploads are capped small enough
 * (see `MAX_UPLOAD_BYTES`) for that to stay sensible.
 */
export interface FileStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const databaseStore: FileStore = {
  async put(key, bytes) {
    // Prisma's Bytes wants a Uint8Array backed by a plain ArrayBuffer.
    await prisma.fileBlob.create({ data: { key, bytes: new Uint8Array(bytes) } });
  },
  async get(key) {
    const row = await prisma.fileBlob.findUnique({ where: { key } });
    return row ? new Uint8Array(row.bytes) : null;
  },
  async delete(key) {
    await prisma.fileBlob.deleteMany({ where: { key } });
  },
};

export function fileStore(): FileStore {
  return databaseStore;
}
