import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  ADD_ONS,
  readAddOns,
  readOpdSettings,
  type AddOn,
  type AddOnState,
  type OpdSettings,
} from "@/lib/add-ons";
import { Permission, assertPermission } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { ServiceError, notFound } from "./errors";

/**
 * What this organization has switched on: licensed add-ons and how its OPD
 * runs. Read once per request — the shell, the page and its services share it.
 *
 * A locked add-on is enforced here, in the services, not by hiding a link:
 * a crafted request to a locked screen's action is refused the same way.
 */

export interface OrganizationFeatures {
  addOns: AddOnState;
  opd: OpdSettings;
}

const load = cache(async (organizationId: string): Promise<OrganizationFeatures> => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { modules: true, settings: true },
  });
  if (!organization) throw notFound("Organization");
  return {
    addOns: readAddOns(organization.modules),
    opd: readOpdSettings(organization.settings),
  };
});

export function getFeatures(actor: RequestActor): Promise<OrganizationFeatures> {
  return load(actor.organizationId);
}

export async function hasAddOn(actor: RequestActor, addOn: AddOn): Promise<boolean> {
  return (await getFeatures(actor)).addOns[addOn];
}

export async function assertAddOn(actor: RequestActor, addOn: AddOn): Promise<void> {
  if (!(await hasAddOn(actor, addOn))) {
    throw new ServiceError(
      "FORBIDDEN",
      `${ADD_ONS[addOn].label} is an add-on this clinic has not enabled.`,
      "Contact AADRIQUE to add it to your plan.",
    );
  }
}

/** Spec §12 — whether patients pass through vitals before the doctor. */
export async function setVitalsStep(actor: RequestActor, enabled: boolean): Promise<void> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { settings: true },
    });
    const settings =
      organization.settings && typeof organization.settings === "object"
        ? (organization.settings as Record<string, unknown>)
        : {};

    await tx.organization.update({
      where: { id: actor.organizationId },
      data: { settings: { ...settings, vitalsStep: enabled } },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Organization",
      entityId: actor.organizationId,
      summary: enabled ? "Turned the vitals step on" : "Turned the vitals step off",
      metadata: { vitalsStep: enabled },
    });
  }, { timeout: 20_000, maxWait: 10_000 });
}
