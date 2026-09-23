"use server";

import { z } from "zod";
import { requireActor } from "@/server/context";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";

/**
 * Spec §20 — reading a notification is remembered, not just hidden until the
 * next page load. The actor comes from the session; an id that is not theirs
 * matches nothing.
 */

export async function markNotificationReadAction(id: string): Promise<void> {
  const actor = await requireActor();
  await markNotificationRead(actor, z.string().min(1).max(64).parse(id));
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const actor = await requireActor();
  await markAllNotificationsRead(actor);
}
