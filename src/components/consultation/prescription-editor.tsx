"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bookmark,
  BookmarkPlus,
  Check,
  History,
  LoaderCircle,
  Pill,
  Plus,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteRxSetAction,
  savePrescriptionAction,
  saveRxSetAction,
  searchMedicationsAction,
} from "@/app/(dashboard)/doctor/consultations/[visitId]/actions";
import {
  FREQUENCIES,
  allergyMatches,
  expandFrequency,
  mergePrescriptionLines,
  type PrescriptionLine,
} from "@/server/rules/prescriptions";
import type { ConsultationWorkspace } from "@/server/services/consultation";
import type { MedicationHit, PrescriptionView } from "@/server/services/prescriptions";
import { useConsultation } from "./consultation-context";
import { PhraseMenu } from "./phrase-menu";

/**
 * Spec §6 — the prescription, written under the note. It saves as the doctor
 * types, like the note, and signing asks it to save once more first, because
 * signing issues whatever was last saved.
 *
 * Nothing here is retyped if it can be avoided: the last prescription repeats
 * in one click, a doctor's own sets apply in one click, a medicine they have
 * prescribed before brings their usual dose with it, and "1-0-1" or "bd" is
 * written out for the patient.
 */

interface Row {
  key: string;
  medicationId: string | null;
  medicationName: string;
  dosage: string;
  frequency: string;
  route: string;
  durationDays: string;
  instructions: string;
}

let counter = 0;
const newKey = () => `rx${(counter += 1)}`;

const emptyRow = (): Row => ({
  key: newKey(),
  medicationId: null,
  medicationName: "",
  dosage: "",
  frequency: "",
  route: "",
  durationDays: "",
  instructions: "",
});

function toRow(line: PrescriptionLine): Row {
  return {
    key: newKey(),
    medicationId: line.medicationId,
    medicationName: line.medicationName,
    dosage: line.dosage ?? "",
    frequency: line.frequency ?? "",
    route: line.route ?? "",
    durationDays: line.durationDays ? String(line.durationDays) : "",
    instructions: line.instructions ?? "",
  };
}

function toLine(row: Row): PrescriptionLine {
  return {
    medicationId: row.medicationId,
    medicationName: row.medicationName.trim(),
    dosage: row.dosage.trim() || null,
    frequency: row.frequency.trim() || null,
    route: row.route.trim() || null,
    durationDays: row.durationDays ? Number(row.durationDays) : null,
    instructions: row.instructions.trim() || null,
  };
}

const named = (rows: Row[]) => rows.filter((r) => r.medicationName.trim());

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

type Previous = ConsultationWorkspace["previousPrescriptions"];

export function PrescriptionEditor({
  visitId,
  prescription,
  allergies,
  previous,
}: {
  visitId: string;
  prescription: PrescriptionView;
  /** The patient's recorded allergy substances, checked as each medicine is written. */
  allergies: string[];
  /** Issued prescriptions from earlier visits, newest first. */
  previous: Previous;
}) {
  const { reportRx, registerFlush } = useConsultation();
  const [rows, setRows] = React.useState<Row[]>(() => prescription.items.map(toRow));
  const [advice, setAdvice] = React.useState(prescription.advice ?? "");
  const [state, setState] = React.useState<SaveState>({ kind: "idle" });

  const dirty = React.useRef(false);
  const latest = React.useRef({ rows, advice });
  const inflight = React.useRef<Promise<boolean> | null>(null);
  const lastOk = React.useRef(true);

  React.useEffect(() => {
    latest.current = { rows, advice };
  }, [rows, advice]);

  // Checked here, as the doctor writes, with the same rule the server uses —
  // not a second after the autosave lands.
  const warnings = React.useMemo(
    () => [...new Set(named(rows).flatMap((r) => allergyMatches(r.medicationName, allergies)))],
    [rows, allergies],
  );

  React.useEffect(() => {
    reportRx({ count: named(rows).length, warnings });
  }, [rows, warnings, reportRx]);

  const change = (updater: (prev: Row[]) => Row[]) => {
    dirty.current = true;
    setRows(updater);
  };
  const update = (key: string, patch: Partial<Row>) =>
    change((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Saves now if anything changed, after any save already on its way. */
  const saveNow = React.useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    if (!dirty.current) return lastOk.current;
    dirty.current = false;
    setState({ kind: "saving" });

    const { rows: current, advice: currentAdvice } = latest.current;
    const request = savePrescriptionAction(visitId, {
      advice: currentAdvice || null,
      items: named(current).map(toLine),
    }).then((result) => {
      if (result.ok) {
        setState({ kind: "saved" });
      } else {
        // Left dirty, so the next change or the sign button tries again.
        dirty.current = true;
        setState({ kind: "error", message: [result.message, result.action].filter(Boolean).join(" ") });
      }
      return result.ok;
    });

    inflight.current = request;
    const ok = await request;
    inflight.current = null;
    lastOk.current = ok;
    return ok;
  }, [visitId]);

  React.useEffect(() => {
    if (!prescription.editable) return;
    return registerFlush(saveNow);
  }, [prescription.editable, registerFlush, saveNow]);

  // Save a second after the last change.
  React.useEffect(() => {
    if (!dirty.current || !prescription.editable) return;
    const timer = setTimeout(() => void saveNow(), 1000);
    return () => clearTimeout(timer);
  }, [rows, advice, prescription.editable, saveNow]);

  /** Adds lines from a previous prescription or a set, never duplicating one. */
  function addLines(lines: PrescriptionLine[], setAdviceTo: string | null, from: string) {
    const { lines: added, skipped } = mergePrescriptionLines(named(rows).map(toLine), lines);
    if (added.length > 0) change((prev) => [...named(prev), ...added.map(toRow)]);
    if (setAdviceTo && !advice.trim()) {
      dirty.current = true;
      setAdvice(setAdviceTo);
    }
    if (added.length === 0) {
      toast.info("Those medicines are already on this prescription.");
    } else {
      toast.success(
        `Added ${added.length} ${added.length === 1 ? "medicine" : "medicines"} from ${from}.`,
        skipped > 0 ? { description: `${skipped} already listed or over the limit, skipped.` } : undefined,
      );
    }
  }

  if (!prescription.editable) {
    return <IssuedPrescription visitId={visitId} prescription={prescription} />;
  }

  const last = previous[0];

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-[15px] font-medium">
            <Pill className="size-4 text-muted-foreground" />
            Prescription
            <Badge variant="muted">Draft</Badge>
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Issued when you sign the consultation, and unchangeable after.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveIndicator state={state} />
          {last && (
            <Button
              variant="outline"
              size="sm"
              title={last.items.map((i) => i.medicationName).join(", ")}
              onClick={() => addLines(last.items, last.advice, formatDate(last.issuedAt))}
            >
              <RotateCcw />
              Repeat {formatDate(last.issuedAt)}
            </Button>
          )}
          <SetsMenu
            previous={previous}
            current={named(rows).map(toLine)}
            advice={advice}
            onApply={addLines}
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[14px] text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Recorded allergy: {warnings.join(", ")}. Check before signing.
        </p>
      )}

      <datalist id="rx-frequencies">
        {FREQUENCIES.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <ol className="space-y-3">
        {rows.map((row, index) => {
          const flagged =
            row.medicationName.trim() !== "" && allergyMatches(row.medicationName, allergies).length > 0;
          return (
            <li
              key={row.key}
              className={cn("rounded-lg border p-3", flagged ? "border-destructive/40 bg-destructive-soft/40" : "border-border")}
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-[13px] font-semibold text-muted-foreground">{index + 1}.</span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[2fr_1fr_1.4fr_90px]">
                  <MedicineInput
                    value={row.medicationName}
                    index={index}
                    autoFocus={index === rows.length - 1 && row.medicationName === ""}
                    onType={(name) => update(row.key, { medicationName: name, medicationId: null })}
                    onPick={(hit) =>
                      // The doctor's usual dose fills only what they have not written.
                      update(row.key, {
                        medicationName: medicationLabel(hit),
                        medicationId: hit.id,
                        dosage: row.dosage || hit.lastUse?.dosage || "",
                        frequency: row.frequency || hit.lastUse?.frequency || "",
                        durationDays:
                          row.durationDays || (hit.lastUse?.durationDays ? String(hit.lastUse.durationDays) : ""),
                        instructions: row.instructions || hit.lastUse?.instructions || "",
                      })
                    }
                  />
                  <Input aria-label={`Medicine ${index + 1} dose`} placeholder="1 tablet" value={row.dosage} onChange={(e) => update(row.key, { dosage: e.target.value })} maxLength={60} />
                  <Input
                    aria-label={`Medicine ${index + 1} frequency`}
                    placeholder="1-0-1, bd, tds…"
                    list="rx-frequencies"
                    value={row.frequency}
                    onChange={(e) => update(row.key, { frequency: e.target.value })}
                    onBlur={(e) => {
                      const expanded = expandFrequency(e.target.value);
                      if (expanded !== e.target.value) update(row.key, { frequency: expanded.slice(0, 60) });
                    }}
                    maxLength={60}
                  />
                  <Input aria-label={`Medicine ${index + 1} days`} placeholder="Days" type="number" min={1} max={365} value={row.durationDays} onChange={(e) => update(row.key, { durationDays: e.target.value })} />
                  <Input className="sm:col-span-4" aria-label={`Medicine ${index + 1} instructions`} placeholder="Instructions — after food, with water…" value={row.instructions} onChange={(e) => update(row.key, { instructions: e.target.value })} maxLength={200} />
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove medicine ${index + 1}`} onClick={() => change((prev) => prev.filter((r) => r.key !== row.key))}>
                  <X />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={rows.length >= 20}
        onClick={() => change((prev) => [...prev, emptyRow()])}
      >
        <Plus />
        Add medicine
      </Button>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="rx-advice" className="text-[13px] font-semibold text-muted-foreground">
            Advice
          </label>
          <PhraseMenu
            field="advice"
            label="Advice"
            current={advice}
            onInsert={(text) => {
              dirty.current = true;
              setAdvice((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text).slice(0, 1000));
            }}
          />
        </div>
        <Textarea
          id="rx-advice"
          rows={2}
          className="mt-1.5"
          value={advice}
          onChange={(e) => {
            dirty.current = true;
            setAdvice(e.target.value);
          }}
          maxLength={1000}
          placeholder="Rest, fluids, review if the fever persists beyond three days"
        />
      </div>
    </Card>
  );
}

/**
 * The doctor's saved sets and the patient's earlier prescriptions, to add in
 * one click — and the current medicines saved as a set for next time.
 */
function SetsMenu({
  previous,
  current,
  advice,
  onApply,
}: {
  previous: Previous;
  current: PrescriptionLine[];
  advice: string;
  onApply: (lines: PrescriptionLine[], advice: string | null, from: string) => void;
}) {
  const { favourites, setFavourites } = useConsultation();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function apply(lines: PrescriptionLine[], setAdvice: string | null, from: string) {
    onApply(lines, setAdvice, from);
    setOpen(false);
  }

  function save() {
    startTransition(async () => {
      const result = await saveRxSetAction({ name: name.trim(), items: current, advice: advice.trim() || null });
      if (result.ok && result.favourites) {
        setFavourites(result.favourites);
        toast.success(`Saved “${name.trim()}”.`);
        setName("");
      } else {
        toast.error(result.message ?? "Could not save the set.", { description: result.action });
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteRxSetAction(id);
      if (result.ok && result.favourites) setFavourites(result.favourites);
      else toast.error(result.message ?? "Could not remove the set.");
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Bookmark />
          Sets
          {favourites.rxSets.length > 0 && (
            <span data-numeric className="text-muted-foreground">
              {favourites.rxSets.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1.5">
        <MenuGroup title="Your sets">
          {favourites.rxSets.length === 0 ? (
            <p className="px-2 py-1 text-[13px] text-muted-foreground">
              Write a prescription you give often, then save it below.
            </p>
          ) : (
            favourites.rxSets.map((set) => (
              <li key={set.id} className="flex items-start gap-1">
                <MenuButton
                  title={set.name}
                  detail={set.items.map((i) => i.medicationName).join(", ")}
                  onClick={() => apply(set.items, set.advice, `“${set.name}”`)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 opacity-60 hover:opacity-100"
                  aria-label={`Remove the set ${set.name}`}
                  disabled={pending}
                  onClick={() => remove(set.id)}
                >
                  <X className="size-3" />
                </Button>
              </li>
            ))
          )}
        </MenuGroup>

        {previous.length > 0 && (
          <MenuGroup title="This patient's earlier prescriptions" icon={History}>
            {previous.map((p) => (
              <li key={p.id}>
                <MenuButton
                  title={`${formatDate(p.issuedAt)} · ${p.doctorName}`}
                  detail={p.items.map((i) => i.medicationName).join(", ")}
                  onClick={() => apply(p.items, p.advice, formatDate(p.issuedAt))}
                />
              </li>
            ))}
          </MenuGroup>
        )}

        <form
          className="mt-1 flex items-center gap-1.5 border-t border-border px-1 pt-2 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && current.length > 0) save();
          }}
        >
          <Input
            aria-label="Name for this set"
            placeholder={current.length > 0 ? "Name, e.g. Viral fever" : "Add medicines to save a set"}
            value={name}
            maxLength={60}
            disabled={current.length === 0 || pending}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-[14px]"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!name.trim() || current.length === 0 || pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <BookmarkPlus />}
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function MenuGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <p className="flex items-center gap-1 px-2 pb-1 text-[12px] font-medium text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {title}
      </p>
      <ul className="max-h-52 space-y-0.5 overflow-y-auto">{children}</ul>
    </div>
  );
}

function MenuButton({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
    >
      <span className="block truncate text-[14px] font-medium">{title}</span>
      <span className="block truncate text-[11.5px] text-muted-foreground">{detail}</span>
    </button>
  );
}

const medicationLabel = (m: MedicationHit) => [m.name, m.strength, m.form].filter(Boolean).join(" ");

/**
 * The medicine box. Empty and focused, it offers the doctor's most-prescribed
 * medicines; typing searches the catalogue, the doctor's own first. Each
 * result shows how they last prescribed it, which is what picking it fills in.
 */
function MedicineInput({
  value,
  index,
  autoFocus,
  onType,
  onPick,
}: {
  value: string;
  index: number;
  autoFocus?: boolean;
  onType: (name: string) => void;
  onPick: (hit: MedicationHit) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [found, setFound] = React.useState<{ term: string; hits: MedicationHit[] }>({ term: "", hits: [] });
  const term = value.trim().length >= 2 ? value.trim() : "";

  React.useEffect(() => {
    if (!open) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const hits = await searchMedicationsAction(term);
      if (!stale) setFound({ term, hits });
    }, term ? 250 : 0);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [term, open]);

  // Only show results for what is in the box now, never a stale search.
  const hits = found.term === term && (term || value.trim() === "") ? found.hits : [];

  return (
    <div className="relative">
      <Input
        aria-label={`Medicine ${index + 1}`}
        placeholder="Medicine"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        maxLength={120}
        autoComplete="off"
      />
      {open && hits.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-overlay sm:w-[min(28rem,80vw)]">
          {!term && (
            <li className="px-2 pt-1 pb-0.5 text-[12px] font-medium text-muted-foreground">
              Your frequent medicines
            </li>
          )}
          {hits.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{medicationLabel(m)}</span>
                  {m.genericName && m.genericName !== m.name && (
                    <span className="truncate text-muted-foreground">· {m.genericName}</span>
                  )}
                </span>
                {m.lastUse && (
                  <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                    <Check className="size-3 text-success" />
                    {[
                      m.lastUse.dosage,
                      m.lastUse.frequency,
                      m.lastUse.durationDays ? `${m.lastUse.durationDays} days` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Prescribed before"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "saving") {
    return <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Saving…</span>;
  }
  if (state.kind === "saved") {
    return <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Check className="size-3 text-success" />Prescription saved</span>;
  }
  if (state.kind === "error") {
    return <span role="alert" className="text-[13px] text-destructive">{state.message}</span>;
  }
  return null;
}

function IssuedPrescription({ visitId, prescription }: { visitId: string; prescription: PrescriptionView }) {
  if (prescription.items.length === 0) {
    return (
      <Card className="p-5 text-[14px] text-muted-foreground">
        No prescription for this visit.
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-[15px] font-medium">
          <Pill className="size-4 text-muted-foreground" />
          Prescription
          <Badge variant={prescription.status === "ISSUED" ? "success" : "muted"}>
            {prescription.status === "ISSUED" ? "Issued" : "Draft"}
          </Badge>
          <span className="font-mono text-[13px] font-normal text-muted-foreground">{prescription.prescriptionNo}</span>
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/print/prescription/${visitId}`} target="_blank">
            <Printer />
            Print
          </Link>
        </Button>
      </div>
      <ol className="space-y-2">
        {prescription.items.map((item, i) => (
          <li key={item.id} className="text-[14px]">
            <span className="font-semibold">{i + 1}. {item.medicationName}</span>
            {/* Dose, frequency and duration are what the patient acts on: full ink. */}
            <span>
              {[item.dosage, item.frequency, item.durationDays ? `${item.durationDays} days` : null, item.instructions]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join("")}
            </span>
          </li>
        ))}
      </ol>
      {prescription.advice && <p className="mt-3 text-[14px]"><span className="font-semibold">Advice:</span> {prescription.advice}</p>}
    </Card>
  );
}
