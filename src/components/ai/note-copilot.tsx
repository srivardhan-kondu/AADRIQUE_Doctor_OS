"use client";

import * as React from "react";
import { Check, LoaderCircle, Mic, Sparkles, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  draftNoteAction,
  gapsAction,
  reviewAction,
  type AIActionResult,
} from "@/app/(dashboard)/doctor/copilot/actions";
import { AIOutputSkeleton, AIOutputView } from "./ai-output";

/**
 * Spec §9 — the documentation copilot, inside the note it is drafting.
 *
 * The doctor dictates or pastes; the draft comes back laid out under clinical
 * headings and sits in a review panel. It is not in the note. Pressing
 * "Insert into note" is the explicit step spec §10 requires — and even then it
 * only fills the editor's fields, which the doctor still saves themselves.
 */

/** Generated headings that map onto a field of the note. */
const FIELD_FOR_HEADING: Record<string, NoteField> = {
  "Chief complaint": "chiefComplaint",
  Symptoms: "symptoms",
  History: "history",
  Examination: "examination",
  Assessment: "assessment",
  Plan: "plan",
};

export type NoteField =
  | "chiefComplaint"
  | "symptoms"
  | "history"
  | "examination"
  | "assessment"
  | "plan";

export function NoteCopilot({
  visitId,
  readOnly,
  onInsert,
}: {
  visitId: string;
  readOnly: boolean;
  onInsert: (values: Partial<Record<NoteField, string>>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [dictation, setDictation] = React.useState("");
  const [result, setResult] = React.useState<AIActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [inserted, setInserted] = React.useState(false);

  if (readOnly) return null;

  function draft() {
    startTransition(async () => {
      setResult(null);
      setInserted(false);
      const next = await draftNoteAction(visitId, dictation);
      setResult(next);
      if (!next.ok) {
        toast.error(next.message ?? "That did not work.", {
          description: next.action,
        });
      }
    });
  }

  function checkGaps() {
    startTransition(async () => {
      setResult(null);
      setInserted(false);
      const next = await gapsAction(visitId);
      setResult(next);
      if (!next.ok) {
        toast.error(next.message ?? "That did not work.", {
          description: next.action,
        });
      }
    });
  }

  function insert() {
    const outcome = result?.outcome;
    if (!outcome) return;

    const values: Partial<Record<NoteField, string>> = {};
    for (const section of outcome.sections) {
      const field = FIELD_FOR_HEADING[section.heading];
      if (!field) continue;
      values[field] = section.lines.join(" ").trim();
    }

    if (Object.keys(values).length === 0) {
      toast.error("There is nothing here that maps onto a note field.");
      return;
    }

    onInsert(values);
    setInserted(true);
    toast.success("Added to the note. Review it, then save.");

    // Spec §30 — inserting is the doctor accepting the output.
    void reviewAction(outcome.actionId, "ACCEPTED");
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <WandSparkles />
          Draft from dictation
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setOpen(true);
            checkGaps();
          }}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          What&rsquo;s missing?
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-ai-border bg-ai-soft/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles className="size-3.5 text-ai" />
            Documentation copilot
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Your words, laid out under clinical headings. Nothing is added or
            interpreted, and nothing reaches the note until you insert it.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close the copilot"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
        >
          <X />
        </Button>
      </div>

      <div>
        <label htmlFor="note-dictation" className="sr-only">
          Dictate or paste the consultation
        </label>
        <Textarea
          id="note-dictation"
          rows={4}
          value={dictation}
          onChange={(e) => setDictation(e.target.value)}
          maxLength={8000}
          placeholder="Patient reports headache for three days, no fever, sleep is poor. Known hypertensive. On examination BP 148 over 92, chest clear. Advise hydration, review in two weeks."
          className="resize-none bg-card text-[13px]"
        />
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Mic className="size-3" />
          Dictate straight into this box with your keyboard&rsquo;s microphone.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          disabled={pending || dictation.trim().length < 10}
          onClick={draft}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
          Structure it
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={checkGaps}
        >
          What&rsquo;s missing?
        </Button>
      </div>

      {pending && <AIOutputSkeleton lines={3} />}

      {!pending && result?.ok && result.outcome && (
        <div className="space-y-2">
          <AIOutputView
            sections={result.outcome.sections}
            sources={result.outcome.sources}
            grounded={result.outcome.grounded}
            note={result.outcome.note}
            provider={result.outcome.provider}
            model={result.outcome.model}
            compact
          />

          {result.outcome.sections.some(
            (s) => FIELD_FOR_HEADING[s.heading] !== undefined,
          ) && (
            <div className="flex justify-end">
              {inserted ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-success">
                  <Check className="size-3.5" />
                  Added to the note — review and save
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={insert}>
                  <Check />
                  Insert into note
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
