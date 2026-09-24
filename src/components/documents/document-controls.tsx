"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, LoaderCircle, Upload } from "lucide-react";
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
import { markLabReviewedAction, uploadDocumentAction } from "@/app/(dashboard)/document-actions";

const KINDS = [
  ["LAB_REPORT", "Lab report"],
  ["IMAGING", "Imaging"],
  ["PRESCRIPTION", "Outside prescription"],
  ["DOCUMENT", "Other document"],
] as const;

const MAX_BYTES = 4 * 1024 * 1024;

export function UploadDocumentDialog({ patientId, visitId = null }: { patientId: string; visitId?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<string>("LAB_REPORT");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    // Checked here too, so a large scan fails at once instead of after the upload.
    if (file instanceof File && file.size > MAX_BYTES) {
      return setError("The file is larger than 4 MB. Scan at a lower resolution, or save as PDF.");
    }
    form.set("patientId", patientId);
    if (visitId) form.set("visitId", visitId);
    startTransition(async () => {
      const result = await uploadDocumentAction(form);
      if (!result.ok) return setError([result.message, result.action].filter(Boolean).join(" "));
      toast.success("Document uploaded");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>PDF, PNG, JPEG or WebP, up to 4 MB.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-[12px] font-medium text-muted-foreground">
            Type
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="mt-1 block h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground"
            >
              {KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-medium text-muted-foreground">
            {kind === "LAB_REPORT" ? "Test" : "Name"}
            <Input
              name="title"
              required
              maxLength={120}
              placeholder={kind === "LAB_REPORT" ? "Complete blood count" : "Discharge summary, 2024"}
              className="mt-1"
            />
          </label>
          <label className="block text-[12px] font-medium text-muted-foreground">
            File
            <Input
              name="file"
              type="file"
              required
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="mt-1"
            />
          </label>
          {kind === "LAB_REPORT" && (
            <>
              <label className="block text-[12px] font-medium text-muted-foreground">
                Key findings <span className="font-normal">(optional)</span>
                <Input name="summary" maxLength={1000} placeholder="Hb 10.2 g/dL, others normal" className="mt-1" />
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="abnormal" className="size-4" />
                Has abnormal values
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarkReviewedButton({ labReportId, patientId }: { labReportId: string; patientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markLabReviewedAction(labReportId, patientId);
          if (result.ok) router.refresh();
          else toast.error(result.message ?? "Could not mark reviewed.");
        })
      }
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
      Mark reviewed
    </Button>
  );
}
