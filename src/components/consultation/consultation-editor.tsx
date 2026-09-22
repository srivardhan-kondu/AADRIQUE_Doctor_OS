"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleAlert,
  LoaderCircle,
  Lock,
  PenLine,
  Signature,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  saveDraftAction,
  signConsultationAction,
} from "@/app/(dashboard)/doctor/consultations/[visitId]/actions";
import type {
  ConsultationDraft,
  ConsultationWorkspace,
} from "@/server/services/consultation";

/**
 * Spec §6 — the consultation note.
 *
 * Drafts autosave on a debounce (spec §35 rule 4) so a refresh, a crash or a
 * walk away never costs the doctor their text. A signed consultation is
 * read-only: the fields disable and the save loop stops (spec §54).
 */

const SECTIONS: Array<{
  key: keyof ConsultationDraft;
  label: string;
  placeholder: string;
  rows?: number;
  required?: boolean;
}> = [
  {
    key: "chiefComplaint",
    label: "Chief complaint",
    placeholder: "What brought the patient in today",
  },
  {
    key: "symptoms",
    label: "Symptoms",
    placeholder: "Onset, duration, character, what makes it better or worse",
  },
  {
    key: "history",
    label: "History",
    placeholder: "Relevant past history, medications, response since last visit",
  },
  {
    key: "examination",
    label: "Examination",
    placeholder: "Findings on examination",
  },
  {
    key: "assessment",
    label: "Assessment",
    placeholder: "Your clinical assessment",
    required: true,
  },
  {
    key: "plan",
    label: "Plan",
    placeholder: "Investigations, treatment, advice, follow-up interval",
  },
];

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

export function ConsultationEditor({
  visitId,
  initial,
  status,
  canSign,
  isOwnConsultation,
  signedAt,
  signedByName,
  draftSavedAt,
}: {
  visitId: string;
  initial: ConsultationDraft;
  status: ConsultationWorkspace["status"];
  canSign: boolean;
  isOwnConsultation: boolean;
  signedAt: Date | null;
  signedByName: string | null;
  draftSavedAt: Date | null;
}) {
  const router = useRouter();
  const signed = status === "SIGNED";
  const readOnly = signed || !isOwnConsultation;

  const [draft, setDraft] = React.useState<ConsultationDraft>(initial);
  const [saveState, setSaveState] = React.useState<SaveState>(
    draftSavedAt ? { kind: "saved", at: draftSavedAt } : { kind: "idle" },
  );
  const [signing, setSigning] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const update = React.useCallback(
    (key: keyof ConsultationDraft, value: string) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      setSaveState({ kind: "dirty" });
    },
    [],
  );

  // Autosave: 1.2s after typing stops. The effect re-arms on every keystroke
  // because `draft` is a dependency, which is exactly the debounce we want —
  // long enough not to save mid-word, short enough that nothing meaningful is
  // ever at risk.
  React.useEffect(() => {
    if (readOnly || saveState.kind !== "dirty") return;

    const timer = setTimeout(async () => {
      setSaveState({ kind: "saving" });
      const result = await saveDraftAction(visitId, draft);

      if (result.ok && result.savedAt) {
        setSaveState({ kind: "saved", at: new Date(result.savedAt) });
      } else {
        setSaveState({
          kind: "error",
          message: result.message ?? "Could not save.",
        });
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [draft, saveState.kind, visitId, readOnly]);

  // Leaving with unsaved text should warn — it is a clinical note.
  React.useEffect(() => {
    if (readOnly) return;
    const unsaved = saveState.kind === "dirty" || saveState.kind === "saving";
    if (!unsaved) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState.kind, readOnly]);

  async function sign() {
    setSigning(true);
    const result = await signConsultationAction(visitId, draft);
    setSigning(false);
    setConfirmOpen(false);

    if (result.ok) {
      toast.success(result.message ?? "Consultation signed.");
      router.refresh();
    } else {
      toast.error(result.message ?? "Could not sign.", {
        description: result.action,
      });
    }
  }

  const hasAssessment = Boolean(draft.assessment?.trim());

  return (
    <div className="space-y-4">
      {/* Status strip: what state this note is in, and when it last saved. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-soft">
        <div className="flex items-center gap-2.5">
          {signed ? (
            <>
              <Badge variant="success">
                <Lock />
                Signed
              </Badge>
              <span className="text-[12px] text-muted-foreground">
                by {signedByName} ·{" "}
                {signedAt?.toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </>
          ) : !isOwnConsultation ? (
            <Badge variant="muted">
              <Lock />
              Read only — another doctor&apos;s consultation
            </Badge>
          ) : (
            <>
              <Badge variant="warning">
                <PenLine />
                Draft
              </Badge>
              <SaveIndicator state={saveState} />
            </>
          )}
        </div>

        {canSign && (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={signing || !hasAssessment}
            title={
              hasAssessment ? undefined : "Record an assessment before signing"
            }
          >
            {signing ? <LoaderCircle className="animate-spin" /> : <Signature />}
            Sign consultation
          </Button>
        )}
      </div>

      {SECTIONS.map((section) => (
        <div key={section.key}>
          <label
            htmlFor={section.key}
            className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            {section.label}
            {section.required && !signed && (
              <span
                className={cn(
                  "text-[10px] normal-case tracking-normal",
                  hasAssessment ? "text-muted-foreground" : "text-accent",
                )}
              >
                required to sign
              </span>
            )}
          </label>
          <Textarea
            id={section.key}
            value={draft[section.key] ?? ""}
            onChange={(e) => update(section.key, e.target.value)}
            placeholder={readOnly ? "Not recorded" : section.placeholder}
            disabled={readOnly}
            rows={section.key === "chiefComplaint" ? 2 : 3}
            className={cn(readOnly && "bg-muted/40")}
          />
        </div>
      ))}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign this consultation?</DialogTitle>
            <DialogDescription>
              Signing closes the visit and makes this note part of the permanent
              clinical record. It cannot be edited afterwards — further findings
              go in a new visit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Keep editing</Button>
            </DialogClose>
            <Button onClick={sign} disabled={signing}>
              {signing ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Signature />
              )}
              Sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" />
        Saving…
      </span>
    );
  }

  if (state.kind === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Check className="size-3 text-success" />
        Saved{" "}
        <span data-numeric>
          {state.at.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </span>
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-destructive">
        <CircleAlert className="size-3" />
        {state.message}
      </span>
    );
  }

  if (state.kind === "dirty") {
    return (
      <span className="text-[12px] text-muted-foreground">Unsaved changes</span>
    );
  }

  return null;
}
