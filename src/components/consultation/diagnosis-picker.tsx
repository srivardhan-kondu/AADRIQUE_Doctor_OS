"use client";

import * as React from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  addDiagnosisAction,
  removeDiagnosisAction,
} from "@/app/(dashboard)/doctor/consultations/[visitId]/actions";
import type { DiagnosisView } from "@/server/services/consultation";

/**
 * Spec §6 — the visit's diagnoses as structured entries, not only prose.
 *
 * The doctor's most-used diagnoses sit underneath as one-click chips; anything
 * else is typed and added with Enter. Each change saves at once, and the
 * editor keeps the assessment in step while the doctor has not written one of
 * their own (`syncAssessment`).
 */
export function DiagnosisPicker({
  visitId,
  diagnoses,
  recent,
  readOnly,
  onChange,
}: {
  visitId: string;
  diagnoses: DiagnosisView[];
  recent: string[];
  readOnly: boolean;
  onChange: (next: DiagnosisView[]) => void;
}) {
  const [text, setText] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const listId = `dx-suggestions-${visitId}`;
  const chosen = new Set(diagnoses.map((d) => d.name.toLowerCase()));
  const suggestions = recent.filter((name) => !chosen.has(name.toLowerCase())).slice(0, 8);

  function add(name: string) {
    const trimmed = name.trim();
    if (trimmed.length < 2 || chosen.has(trimmed.toLowerCase())) {
      setText("");
      return;
    }
    startTransition(async () => {
      const result = await addDiagnosisAction(visitId, { name: trimmed });
      if (result.ok && result.diagnoses) {
        onChange(result.diagnoses);
        setText("");
      } else {
        toast.error(result.message ?? "Could not add the diagnosis.", { description: result.action });
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeDiagnosisAction(visitId, id);
      if (result.ok && result.diagnoses) onChange(result.diagnoses);
      else toast.error(result.message ?? "Could not remove the diagnosis.");
    });
  }

  if (readOnly && diagnoses.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={`dx-${visitId}`} className="text-[13px] font-medium text-muted-foreground">
          Diagnosis
        </label>
        {pending && <LoaderCircle className="size-3 animate-spin text-muted-foreground" />}
      </div>

      {diagnoses.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {diagnoses.map((d) => (
            <li key={d.id}>
              <Badge variant={d.isPrimary ? "accent" : "muted"} className="gap-1 py-1 text-[12.5px]">
                {d.name}
                {d.code && <span className="font-mono text-[12px] opacity-70">{d.code}</span>}
                {d.isPrimary && diagnoses.length > 1 && <span className="text-[12px] opacity-70">· primary</span>}
                {!readOnly && (
                  <button
                    type="button"
                    className="-mr-1 rounded-full p-0.5 hover:bg-foreground/10"
                    aria-label={`Remove ${d.name}`}
                    disabled={pending}
                    onClick={() => remove(d.id)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <>
          <Input
            id={`dx-${visitId}`}
            value={text}
            list={listId}
            placeholder="Add a diagnosis and press Enter"
            maxLength={160}
            autoComplete="off"
            disabled={pending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(text);
              }
            }}
          />
          <datalist id={listId}>
            {recent.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={pending}
                  onClick={() => add(name)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <Plus className="size-3" />
                  {name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
