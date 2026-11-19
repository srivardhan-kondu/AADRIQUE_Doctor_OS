"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  LoaderCircle,
  Lock,
  PenLine,
  Signature,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NoteCopilot, type NoteField } from "@/components/ai/note-copilot";
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
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { useMounted } from "@/hooks/use-mounted";
import {
  saveDraftAction,
  signConsultationAction,
} from "@/app/(dashboard)/doctor/consultations/[visitId]/actions";
import type { PhraseField } from "@/lib/clinical-phrases";
import {
  FOLLOW_UP_CHOICES,
  followUpDueDate,
  syncAssessment,
} from "@/server/rules/consultation";
import type {
  ConsultationDraft,
  ConsultationWorkspace,
  DiagnosisView,
} from "@/server/services/consultation";
import type { Favourites } from "@/server/services/favourites";
import { ConsultationContextProvider, type RxSummary } from "./consultation-context";
import { DiagnosisPicker } from "./diagnosis-picker";
import { PhraseMenu } from "./phrase-menu";

/**
 * Spec §6 — the consultation note, and the end of the visit.
 *
 * Drafts autosave on a debounce (spec §35 rule 4) so a refresh, a crash or a
 * walk away never costs the doctor their text. A signed consultation is
 * read-only: the fields disable and the save loop stops (spec §54).
 *
 * The prescription is passed in as `children` and sits under the note, so the
 * whole visit is one scroll. Signing happens once, at the bottom: it saves the
 * prescription, books the review the doctor picked, and — for a patient
 * called from today's queue — brings the next one in.
 */

const SECTIONS: Array<{
  key: NoteField;
  label: string;
  placeholder: string;
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

const isApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

export function ConsultationEditor({
  visitId,
  initial,
  status,
  canSign,
  isOwnConsultation,
  signedAt,
  signedByName,
  draftSavedAt,
  inRoom,
  diagnoses: initialDiagnoses,
  recentDiagnoses,
  followUp,
  favourites: initialFavourites,
  children,
}: {
  visitId: string;
  initial: ConsultationDraft;
  status: ConsultationWorkspace["status"];
  canSign: boolean;
  isOwnConsultation: boolean;
  signedAt: Date | null;
  signedByName: string | null;
  draftSavedAt: Date | null;
  /** Called in from today's queue — signing can bring the next patient in. */
  inRoom: boolean;
  diagnoses: DiagnosisView[];
  recentDiagnoses: string[];
  followUp: ConsultationWorkspace["followUp"];
  favourites: Favourites;
  /** The prescription, rendered between the note and the sign bar. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  // The modifier key differs by platform, which the server cannot know.
  const mounted = useMounted();
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const signed = status === "SIGNED";
  const readOnly = signed || !isOwnConsultation;

  const [draft, setDraft] = React.useState<ConsultationDraft>(initial);
  const [saveState, setSaveState] = React.useState<SaveState>(
    draftSavedAt ? { kind: "saved", at: draftSavedAt } : { kind: "idle" },
  );
  const [diagnoses, setDiagnoses] = React.useState(initialDiagnoses);
  const [followUpDays, setFollowUpDays] = React.useState<number | null>(null);
  const [favourites, setFavourites] = React.useState(initialFavourites);
  const [rx, setRx] = React.useState<RxSummary>({ count: 0, warnings: [] });
  const [signing, setSigning] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Editors that save on their own debounce, asked to save before signing.
  const flushers = React.useRef(new Set<() => Promise<boolean>>());
  const context = React.useMemo(
    () => ({
      reportRx: setRx,
      registerFlush: (flush: () => Promise<boolean>) => {
        flushers.current.add(flush);
        return () => {
          flushers.current.delete(flush);
        };
      },
      favourites,
      setFavourites,
    }),
    [favourites],
  );

  const update = React.useCallback((key: keyof ConsultationDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaveState({ kind: "dirty" });
  }, []);

  /** Appends text to a field on a new line — used by quick text. */
  const append = React.useCallback((key: NoteField, text: string) => {
    setDraft((prev) => {
      const existing = (prev[key] ?? "").trim();
      return { ...prev, [key]: existing ? `${existing}\n${text}` : text };
    });
    setSaveState({ kind: "dirty" });
  }, []);

  /**
   * Spec §10 — a generated draft only ever lands in the editor, never in the
   * record. It appends rather than replaces: a doctor who already typed an
   * assessment does not lose it to a draft.
   */
  const insertFromCopilot = React.useCallback(
    (values: Partial<Record<NoteField, string>>) => {
      for (const [key, value] of Object.entries(values)) {
        if (value) append(key as NoteField, value);
      }
    },
    [append],
  );

  /** The assessment follows the diagnoses until the doctor writes their own. */
  function changeDiagnoses(next: DiagnosisView[]) {
    const before = diagnoses.map((d) => d.name);
    const after = next.map((d) => d.name);
    setDiagnoses(next);
    const assessment = syncAssessment(draft.assessment, before, after);
    if (assessment !== (draft.assessment ?? "")) update("assessment", assessment);
  }

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

  const hasAssessment = Boolean(draft.assessment?.trim());

  const openSign = React.useCallback(() => {
    if (!hasAssessment) {
      toast.error("Record an assessment before signing.", {
        description: "Pick a diagnosis or write the assessment.",
      });
      document.getElementById("assessment")?.focus();
      return;
    }
    setConfirmOpen(true);
  }, [hasAssessment]);

  // ⌘/Ctrl + Enter opens the sign dialog from anywhere on the page, including
  // while typing; Enter in the dialog then confirms its focused action.
  React.useEffect(() => {
    if (!canSign) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      openSign();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSign, openSign]);

  async function sign(andCallNext: boolean) {
    setSigning(true);
    // Stop the autosave loop: the signature carries this text itself.
    setSaveState({ kind: "idle" });

    const flushed = await Promise.all([...flushers.current].map((flush) => flush()));
    if (flushed.some((ok) => !ok)) {
      setSigning(false);
      setSaveState({ kind: "dirty" });
      toast.error("The prescription could not be saved, so nothing was signed.", {
        description: "Check the prescription for the error shown, then sign again.",
      });
      return;
    }

    const result = await signConsultationAction(visitId, draft, {
      followUpInDays: followUpDays,
      callNext: andCallNext,
    });
    setSigning(false);
    setConfirmOpen(false);

    if (result.ok) {
      toast.success(result.message ?? "Consultation signed.");
      if (result.redirectTo) router.push(result.redirectTo);
      else router.refresh();
    } else {
      setSaveState({ kind: "dirty" });
      toast.error(result.message ?? "Could not sign.", {
        description: result.action,
      });
    }
  }

  const dueDate = followUpDays ? followUpDueDate(new Date(), followUpDays) : null;

  return (
    <ConsultationContextProvider value={context}>
      <div className="space-y-4">
        {/* Status strip: what state this note is in, and when it last saved. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-soft">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            {signed ? (
              <>
                <Badge variant="success">
                  <Lock />
                  Signed
                </Badge>
                <span className="text-[13px] text-muted-foreground">
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
            <span className="hidden items-center gap-1 text-[13px] text-muted-foreground sm:flex">
              Sign with <Kbd>{mounted && isApple() ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>Enter</Kbd>
            </span>
          )}
        </div>

        {/* Spec §9 — the documentation copilot sits with the note it drafts. */}
        <NoteCopilot visitId={visitId} readOnly={readOnly} onInsert={insertFromCopilot} />

        {SECTIONS.map((section) => (
          <React.Fragment key={section.key}>
            {section.key === "assessment" && (
              <DiagnosisPicker
                visitId={visitId}
                diagnoses={diagnoses}
                recent={recentDiagnoses}
                readOnly={readOnly}
                onChange={changeDiagnoses}
              />
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor={section.key}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  {section.label}
                  {section.required && !signed && (
                    <span
                      className={cn(
                        "text-[12px]",
                        hasAssessment ? "text-muted-foreground" : "text-accent-ink",
                      )}
                    >
                      required to sign
                    </span>
                  )}
                </label>
                {!readOnly && section.key !== "chiefComplaint" && (
                  <PhraseMenu
                    field={section.key as PhraseField}
                    label={section.label}
                    current={draft[section.key] ?? ""}
                    onInsert={(text) => append(section.key, text)}
                  />
                )}
              </div>
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
          </React.Fragment>
        ))}

        {children}

        <FollowUpChoice
          readOnly={readOnly}
          existing={followUp}
          days={followUpDays}
          onChange={setFollowUpDays}
        />

        {canSign && (
          // Sticks to the bottom of the screen, so signing never needs a
          // scroll back to the top of a long note.
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-overlay backdrop-blur">
            <p className="min-w-0 text-[13px] text-muted-foreground">
              {rx.count > 0
                ? `${rx.count} ${rx.count === 1 ? "medicine" : "medicines"} will be issued`
                : "No prescription"}
              {dueDate && ` · review ${formatDay(dueDate)}`}
              {rx.warnings.length > 0 && (
                <span className="ml-1.5 font-medium text-destructive">· allergy warning</span>
              )}
            </p>
            <Button onClick={openSign} disabled={signing}>
              {signing ? <LoaderCircle className="animate-spin" /> : <Signature />}
              Sign consultation
            </Button>
          </div>
        )}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent
            className="max-w-md"
            // Focus the main action, so Enter confirms it.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              primaryRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Sign this consultation?</DialogTitle>
              <DialogDescription>
                The note becomes part of the permanent record and cannot be edited
                afterwards.
              </DialogDescription>
            </DialogHeader>

            {/* What is about to happen, so the extra click is a real check. */}
            <dl className="space-y-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-[14px]">
              <SummaryRow label="Assessment">
                <span className="line-clamp-2">{draft.assessment}</span>
              </SummaryRow>
              <SummaryRow label="Prescription">
                {rx.count > 0
                  ? `${rx.count} ${rx.count === 1 ? "medicine" : "medicines"}, issued on signing`
                  : "None"}
              </SummaryRow>
              {rx.warnings.length > 0 && (
                <p role="alert" className="flex items-start gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Matches a recorded allergy: {rx.warnings.join(", ")}
                </p>
              )}
              <SummaryRow label="Follow-up">
                {dueDate ? `Review ${formatDay(dueDate)}` : followUp ? `Booked ${formatDay(followUp.dueDate)}` : "None"}
              </SummaryRow>
            </dl>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Keep editing</Button>
              </DialogClose>
              <Button
                ref={inRoom ? undefined : primaryRef}
                variant={inRoom ? "outline" : "default"}
                onClick={() => sign(false)}
                disabled={signing}
              >
                {signing ? <LoaderCircle className="animate-spin" /> : <Signature />}
                Sign
              </Button>
              {inRoom && (
                <Button ref={primaryRef} variant="accent" onClick={() => sign(true)} disabled={signing}>
                  {signing ? <LoaderCircle className="animate-spin" /> : <Signature />}
                  Sign &amp; call next
                  <ArrowRight />
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ConsultationContextProvider>
  );
}

/**
 * Spec §42 — the review interval, picked here and booked when the note is
 * signed, instead of typed into the plan and re-entered on the follow-ups
 * screen.
 */
function FollowUpChoice({
  readOnly,
  existing,
  days,
  onChange,
}: {
  readOnly: boolean;
  existing: ConsultationWorkspace["followUp"];
  days: number | null;
  onChange: (days: number | null) => void;
}) {
  if (readOnly) {
    if (!existing) return null;
    return (
      <p className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
        <CalendarClock className="size-3.5" />
        Follow-up booked for {formatDay(existing.dueDate)}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-soft">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <CalendarClock className="size-3.5" />
        Follow-up
        {existing && !days && (
          <span className="font-normal">· booked for {formatDay(existing.dueDate)}</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Review in">
        <Chip selected={days === null} onClick={() => onChange(null)}>
          {existing ? "Keep as booked" : "No follow-up"}
        </Chip>
        {FOLLOW_UP_CHOICES.map((choice) => (
          <Chip key={choice.days} selected={days === choice.days} onClick={() => onChange(choice.days)}>
            {choice.label}
          </Chip>
        ))}
      </div>
      {days && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Booked for {formatDay(followUpDueDate(new Date(), days))} when you sign.
        </p>
      )}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" />
        Saving…
      </span>
    );
  }

  if (state.kind === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Check className="size-3 text-success" />
        Saved{" "}
        <span data-numeric>
          {state.at.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })}
        </span>
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-destructive">
        <CircleAlert className="size-3" />
        {state.message}
      </span>
    );
  }

  if (state.kind === "dirty") {
    return <span className="text-[13px] text-muted-foreground">Unsaved changes</span>;
  }

  return null;
}
