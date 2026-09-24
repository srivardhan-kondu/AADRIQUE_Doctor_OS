"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { erasePatientAction } from "@/app/(dashboard)/admin/patients/[patientId]/actions";

/** DPDP Act 2023 — the admin's two tools for a patient's data request. */
export function PatientDataRights({ patientId, mrn, canErase }: { patientId: string; mrn: string; canErase: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <Button asChild variant="outline">
        <a href={`/api/patients/${patientId}/export`} download>
          <Download />
          Export data
        </a>
      </Button>
      {canErase && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-destructive">
              <UserX />
              Erase identity
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Erase this patient&apos;s identity?</DialogTitle>
              <DialogDescription>
                For a patient who has asked for their data to be erased. Name, contact details, identifiers, message
                contents and AI drafts are removed, and nothing more is sent to them. Consultations, prescriptions and
                reports stay, de-identified, for the legal retention period. This cannot be undone — export their data
                first if they asked for a copy.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-[13px] font-medium">
              Type the patient ID, <span className="font-mono">{mrn}</span>, to confirm
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 font-mono" />
            </label>
            {error && (
              <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={pending || confirm.trim().toUpperCase() !== mrn.toUpperCase()}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await erasePatientAction(patientId, confirm);
                    if (!result.ok) return setError(result.message ?? "Could not erase.");
                    toast.success("Identity erased");
                    router.push("/admin/patients");
                  })
                }
              >
                {pending && <LoaderCircle className="animate-spin" />}
                Erase identity
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
