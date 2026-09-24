"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { erasePatient } from "@/server/services/patient-data";

export async function erasePatientAction(patientId: string, confirmMrn: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const id = z.string().min(1).max(64).parse(patientId);
    await erasePatient(await requireActor(), id, z.string().max(40).parse(confirmMrn));
    revalidatePath(`/admin/patients/${id}`);
    revalidatePath("/admin/patients");
    return { ok: true };
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, message: error.message };
    if (error instanceof PermissionError) return { ok: false, message: "Only an administrator can erase a patient's data." };
    console.error("Erasure failed", error);
    return { ok: false, message: "The erasure did not complete; nothing was changed. Try again." };
  }
}
