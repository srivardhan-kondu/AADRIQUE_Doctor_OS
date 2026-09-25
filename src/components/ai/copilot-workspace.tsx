"use client";

import * as React from "react";
import {
  BookOpen,
  Check,
  FileText,
  History,
  LoaderCircle,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  findPatientsAction,
  historySearchAction,
  knowledgeAction,
  reviewAction,
  summaryAction,
  type AIActionResult,
  type CopilotPatient,
} from "@/app/(dashboard)/doctor/copilot/actions";
import { AIOutputSkeleton, AIOutputView } from "./ai-output";

/**
 * Spec §9 — the AI Copilot as a product layer, not a chat window.
 *
 * Each action is a named job with a known input and a reviewable output. The
 * doctor picks the job; they do not have to discover what to type. Anything
 * about a patient requires a patient to be chosen first, because an answer
 * about "a patient" is not something this product will guess at.
 */

type Mode = "summary" | "history" | "knowledge";

const MODES: {
  id: Mode;
  label: string;
  icon: LucideIcon;
  blurb: string;
  needsPatient: boolean;
  placeholder?: string;
}[] = [
  {
    id: "summary",
    label: "Patient summary",
    icon: FileText,
    blurb:
      "Recent visits, medications, open follow-ups and reports, condensed into a short read.",
    needsPatient: true,
  },
  {
    id: "history",
    label: "Find in history",
    icon: History,
    blurb: "Ask in plain language and get the matching records, with links.",
    needsPatient: true,
    placeholder: "last migraine-related visit",
  },
  {
    id: "knowledge",
    label: "Hospital knowledge",
    icon: BookOpen,
    blurb: "Answers quoted from approved SOPs, policies and guidelines.",
    needsPatient: false,
    placeholder: "What is the current discharge workflow?",
  },
];

export function CopilotWorkspace({
  modelConfigured,
}: {
  modelConfigured: boolean;
}) {
  const [mode, setMode] = React.useState<Mode>("summary");
  const [patient, setPatient] = React.useState<CopilotPatient | null>(null);
  const [question, setQuestion] = React.useState("");
  const [result, setResult] = React.useState<AIActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  const active = MODES.find((m) => m.id === mode)!;

  function run() {
    startTransition(async () => {
      setResult(null);

      const next =
        mode === "summary"
          ? await summaryAction(patient!.id)
          : mode === "history"
            ? await historySearchAction(patient!.id, question)
            : await knowledgeAction(question);

      setResult(next);

      if (!next.ok) {
        toast.error(next.message ?? "That did not work.", {
          description: next.action,
        });
      }
    });
  }

  const ready =
    !pending &&
    (active.needsPatient ? patient !== null : true) &&
    (mode === "summary" ? true : question.trim().length > 2);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
      <div className="space-y-4">
        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-ai" />
              What do you need?
            </CardTitle>
          </CardHeader>

          <ul className="p-2">
            {MODES.map((option) => {
              const Icon = option.icon;
              const selected = option.id === mode;

              return (
                <li key={option.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setMode(option.id);
                      setResult(null);
                      setQuestion("");
                    }}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      selected
                        ? "ai-surface"
                        : "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        selected ? "text-ai" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {option.blurb}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Spec §10 — the product says plainly which engine is answering. */}
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <p className="text-[12px] font-medium text-muted-foreground">
            Engine
          </p>
          <p className="mt-1 text-[12px] leading-snug">
            {modelConfigured ? (
              <>
                <span className="font-semibold">Claude</span> writes the answer,
                and every citation is checked back against the record before you
                see it.
              </>
            ) : (
              <>
                No model is configured, so answers are{" "}
                <span className="font-semibold">assembled from the records</span>{" "}
                themselves. Nothing is generated, and nothing can be invented.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <div className="space-y-3.5 p-5">
            {active.needsPatient && (
              <PatientField patient={patient} onChange={setPatient} />
            )}

            {mode !== "summary" && (
              <div>
                <label
                  htmlFor="copilot-question"
                  className="text-[12px] font-semibold text-muted-foreground"
                >
                  Your question
                </label>
                <Textarea
                  id="copilot-question"
                  rows={2}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={active.placeholder}
                  maxLength={500}
                  className="mt-1.5 resize-none text-[13px]"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-muted-foreground">
                {active.needsPatient && !patient
                  ? "Choose a patient first."
                  : "Nothing you do here changes a record."}
              </p>
              <Button variant="accent" disabled={!ready} onClick={run}>
                {pending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {pending ? "Reading the record…" : "Ask"}
              </Button>
            </div>
          </div>
        </Card>

        {pending && <AIOutputSkeleton />}

        {!pending && result?.ok && result.outcome && (
          <ReviewableOutput outcome={result.outcome} />
        )}

        {!pending && !result && (
          <Card className="border-dashed">
            <EmptyState
              icon={Sparkles}
              title="Nothing asked yet"
              description={
                active.needsPatient
                  ? "Pick a patient and an action. Every answer comes back with the records it was built from."
                  : "Ask a question about hospital policy. Answers are quoted from approved documents only."
              }
            />
          </Card>
        )}
      </div>
    </div>
  );
}

/** Spec §10 — a generated output is not finished until a doctor rules on it. */
function ReviewableOutput({
  outcome,
}: {
  outcome: NonNullable<AIActionResult["outcome"]>;
}) {
  const [decision, setDecision] = React.useState<"ACCEPTED" | "REJECTED" | null>(
    null,
  );
  const [pending, startTransition] = React.useTransition();

  function decide(next: "ACCEPTED" | "REJECTED") {
    startTransition(async () => {
      const result = await reviewAction(outcome.actionId, next);
      if (result.ok) {
        setDecision(next);
        toast.success(result.message ?? "Recorded.");
      } else {
        toast.error(result.message ?? "That did not work.", {
          description: result.action,
        });
      }
    });
  }

  return (
    <div className="space-y-2">
      <AIOutputView
        sections={outcome.sections}
        sources={outcome.sources}
        grounded={outcome.grounded}
        note={outcome.note}
        provider={outcome.provider}
        model={outcome.model}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {decision ? (
          <Badge variant={decision === "ACCEPTED" ? "success" : "muted"}>
            {decision === "ACCEPTED" ? "Accepted" : "Dismissed"}
          </Badge>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => decide("REJECTED")}
            >
              <X />
              Not useful
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => decide("ACCEPTED")}
            >
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              Looks right
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function PatientField({
  patient,
  onChange,
}: {
  patient: CopilotPatient | null;
  onChange: (patient: CopilotPatient | null) => void;
}) {
  const [term, setTerm] = React.useState("");
  const [loaded, setLoaded] = React.useState<{
    term: string;
    rows: CopilotPatient[];
  } | null>(null);
  const [searching, startSearching] = React.useTransition();

  React.useEffect(() => {
    if (patient) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      startSearching(async () => {
        const rows = await findPatientsAction(term);
        if (!cancelled) setLoaded({ term, rows });
      });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, patient]);

  const rows = loaded?.term === term ? loaded.rows : [];

  if (patient) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2">
        <UserRound className="size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{patient.name}</p>
          <p className="text-[11px] text-muted-foreground">
            <span data-numeric>{patient.mrn}</span>
            {patient.age !== null && (
              <>
                <span aria-hidden> · </span>
                <span data-numeric>{patient.age}y</span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Choose a different patient"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor="copilot-patient"
        className="text-[12px] font-semibold text-muted-foreground"
      >
        Patient
      </label>

      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="copilot-patient"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Name, mobile number or patient ID"
          className="pl-9"
        />
      </div>

      <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border">
        {searching && rows.length === 0 ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-9 rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-5 text-center text-[12px] text-muted-foreground">
            {term ? `Nobody matches “${term}”.` : "Start typing to find a patient."}
          </p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onChange(row)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {row.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      <span data-numeric>{row.mrn}</span>
                    </span>
                  </span>
                  {row.age !== null && (
                    <Badge variant="muted" data-numeric>
                      {row.age}y
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
