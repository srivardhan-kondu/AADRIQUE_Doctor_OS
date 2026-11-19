import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { Permission, assertPermission } from "@/lib/permissions";
import { PHRASE_FIELDS } from "@/lib/clinical-phrases";
import type { RequestActor } from "@/server/context";
import { ServiceError, invalidState } from "./errors";

/**
 * A doctor's own shortcuts (spec §6, §35 — never make the doctor type the same
 * thing twice): quick-text phrases for the note and prescription sets.
 *
 * They belong to the doctor, so they are stored on `DoctorProfile.favourites`
 * and every read and write goes through the signed-in doctor's own profile —
 * there is no id from the browser to tamper with. The JSON is parsed with the
 * schema below on the way in and on the way out; a value that fails to parse
 * reads as empty rather than breaking the consultation screen.
 */

const MAX_PHRASES = 80;
const MAX_SETS = 40;

const phraseSchema = z.object({
  id: z.string().max(64),
  field: z.enum(PHRASE_FIELDS),
  text: z.string().trim().min(2).max(600),
});

const setItemSchema = z.object({
  medicationId: z.string().max(64).nullable(),
  medicationName: z.string().trim().min(1).max(120),
  dosage: z.string().max(60).nullable(),
  frequency: z.string().max(60).nullable(),
  route: z.string().max(40).nullable(),
  durationDays: z.number().int().min(1).max(365).nullable(),
  instructions: z.string().max(200).nullable(),
});

const rxSetSchema = z.object({
  id: z.string().max(64),
  name: z.string().trim().min(1).max(60),
  items: z.array(setItemSchema).min(1).max(20),
  advice: z.string().max(1000).nullable(),
});

const favouritesSchema = z.object({
  phrases: z.array(phraseSchema).max(MAX_PHRASES).default([]),
  rxSets: z.array(rxSetSchema).max(MAX_SETS).default([]),
});

export type Phrase = z.infer<typeof phraseSchema>;
export type RxSet = z.infer<typeof rxSetSchema>;
export type Favourites = z.infer<typeof favouritesSchema>;

export const newPhraseSchema = phraseSchema.omit({ id: true });
export const newRxSetSchema = rxSetSchema.omit({ id: true });

const EMPTY: Favourites = { phrases: [], rxSets: [] };

function requireDoctor(actor: RequestActor): string {
  if (!actor.doctorId) {
    throw invalidState("Only a doctor has saved phrases and prescription sets.");
  }
  return actor.doctorId;
}

async function read(doctorId: string): Promise<Favourites> {
  const profile = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { favourites: true },
  });
  const parsed = favouritesSchema.safeParse(profile?.favourites ?? {});
  return parsed.success ? parsed.data : EMPTY;
}

async function write(doctorId: string, value: Favourites): Promise<Favourites> {
  const valid = favouritesSchema.parse(value);
  await prisma.doctorProfile.update({
    where: { id: doctorId },
    data: { favourites: valid as unknown as Prisma.InputJsonValue },
  });
  return valid;
}

export async function getFavourites(actor: RequestActor): Promise<Favourites> {
  assertPermission(actor, Permission.CONSULTATION_READ);
  if (!actor.doctorId) return EMPTY;
  return read(actor.doctorId);
}

export async function savePhrase(
  actor: RequestActor,
  input: z.input<typeof newPhraseSchema>,
): Promise<Favourites> {
  assertPermission(actor, Permission.CONSULTATION_UPDATE);
  const doctorId = requireDoctor(actor);
  const phrase = newPhraseSchema.parse(input);
  const current = await read(doctorId);

  const duplicate = current.phrases.some(
    (p) => p.field === phrase.field && p.text.toLowerCase() === phrase.text.toLowerCase(),
  );
  if (duplicate) return current;
  if (current.phrases.length >= MAX_PHRASES) {
    throw new ServiceError("VALIDATION", `You can keep up to ${MAX_PHRASES} phrases.`, "Remove one you no longer use.");
  }
  return write(doctorId, { ...current, phrases: [...current.phrases, { id: randomUUID(), ...phrase }] });
}

export async function deletePhrase(actor: RequestActor, id: string): Promise<Favourites> {
  assertPermission(actor, Permission.CONSULTATION_UPDATE);
  const doctorId = requireDoctor(actor);
  const current = await read(doctorId);
  return write(doctorId, { ...current, phrases: current.phrases.filter((p) => p.id !== id) });
}

export async function saveRxSet(
  actor: RequestActor,
  input: z.input<typeof newRxSetSchema>,
): Promise<Favourites> {
  assertPermission(actor, Permission.PRESCRIPTION_CREATE);
  const doctorId = requireDoctor(actor);
  const set = newRxSetSchema.parse(input);
  const current = await read(doctorId);

  // Saving under an existing name replaces that set — the doctor is updating it.
  const others = current.rxSets.filter((s) => s.name.toLowerCase() !== set.name.toLowerCase());
  if (others.length >= MAX_SETS) {
    throw new ServiceError("VALIDATION", `You can keep up to ${MAX_SETS} sets.`, "Remove one you no longer use.");
  }
  const rxSets = [...others, { id: randomUUID(), ...set }].sort((a, b) => a.name.localeCompare(b.name));
  return write(doctorId, { ...current, rxSets });
}

export async function deleteRxSet(actor: RequestActor, id: string): Promise<Favourites> {
  assertPermission(actor, Permission.PRESCRIPTION_CREATE);
  const doctorId = requireDoctor(actor);
  const current = await read(doctorId);
  return write(doctorId, { ...current, rxSets: current.rxSets.filter((s) => s.id !== id) });
}
