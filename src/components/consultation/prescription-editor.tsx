"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, LoaderCircle, Pill, Plus, Printer, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  savePrescriptionAction,
  searchMedicationsAction,
} from "@/app/(dashboard)/doctor/consultations/[visitId]/actions";
import type { PrescriptionView } from "@/server/services/prescriptions";

/**
 * Spec §6 — the prescription, written beside the note. It saves as the
 * doctor types, like the note, because signing issues whatever was last
 * saved; an explicit Save button would risk issuing without the last line.
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

const FREQUENCIES = [
  "Once daily (OD)",
  "Twice daily (BD)",
  "Three times daily (TDS)",
  "Four times daily (QID)",
  "At night (HS)",
  "When needed (SOS)",
];

function toRows(view: PrescriptionView): Row[] {
  return view.items.map((i) => ({
    key: newKey(),
    medicationId: i.medicationId,
    medicationName: i.medicationName,
    dosage: i.dosage ?? "",
    frequency: i.frequency ?? "",
    route: i.route ?? "",
    durationDays: i.durationDays ? String(i.durationDays) : "",
    instructions: i.instructions ?? "",
  }));
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function PrescriptionEditor({
  visitId,
  prescription,
}: {
  visitId: string;
  prescription: PrescriptionView;
}) {
  const [rows, setRows] = React.useState<Row[]>(() => toRows(prescription));
  const [advice, setAdvice] = React.useState(prescription.advice ?? "");
  const [warnings, setWarnings] = React.useState(prescription.allergyWarnings);
  const [state, setState] = React.useState<SaveState>({ kind: "idle" });
  const dirty = React.useRef(false);

  const change = (updater: (prev: Row[]) => Row[]) => {
    dirty.current = true;
    setRows(updater);
  };
  const update = (key: string, patch: Partial<Row>) =>
    change((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Save a second after the last change.
  React.useEffect(() => {
    if (!dirty.current || !prescription.editable) return;
    const timer = setTimeout(async () => {
      dirty.current = false;
      setState({ kind: "saving" });
      const result = await savePrescriptionAction(visitId, {
        advice: advice || null,
        items: rows
          .filter((r) => r.medicationName.trim())
          .map((r) => ({
            medicationId: r.medicationId,
            medicationName: r.medicationName,
            dosage: r.dosage || null,
            frequency: r.frequency || null,
            route: r.route || null,
            durationDays: r.durationDays ? Number(r.durationDays) : null,
            instructions: r.instructions || null,
          })),
      });
      if (result.ok) {
        setWarnings(result.allergyWarnings ?? []);
        setState({ kind: "saved" });
      } else {
        setState({ kind: "error", message: [result.message, result.action].filter(Boolean).join(" ") });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [rows, advice, visitId, prescription.editable]);

  if (!prescription.editable) {
    return <IssuedPrescription visitId={visitId} prescription={prescription} />;
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold">
            <Pill className="size-4 text-muted-foreground" />
            Prescription
            <Badge variant="muted">Draft</Badge>
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Issued when you sign the consultation, and unchangeable after.
          </p>
        </div>
        <SaveIndicator state={state} />
      </div>

      {warnings.length > 0 && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
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
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-[12px] font-semibold text-muted-foreground">{index + 1}.</span>
              <div className="grid flex-1 gap-2 sm:grid-cols-[2fr_1fr_1.4fr_90px]">
                <MedicineInput
                  value={row.medicationName}
                  index={index}
                  onChange={(name, id) => update(row.key, { medicationName: name, medicationId: id })}
                />
                <Input aria-label={`Medicine ${index + 1} dose`} placeholder="1 tablet" value={row.dosage} onChange={(e) => update(row.key, { dosage: e.target.value })} maxLength={60} />
                <Input aria-label={`Medicine ${index + 1} frequency`} placeholder="How often" list="rx-frequencies" value={row.frequency} onChange={(e) => update(row.key, { frequency: e.target.value })} maxLength={60} />
                <Input aria-label={`Medicine ${index + 1} days`} placeholder="Days" type="number" min={1} max={365} value={row.durationDays} onChange={(e) => update(row.key, { durationDays: e.target.value })} />
                <Input className="sm:col-span-4" aria-label={`Medicine ${index + 1} instructions`} placeholder="Instructions — after food, with water…" value={row.instructions} onChange={(e) => update(row.key, { instructions: e.target.value })} maxLength={200} />
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove medicine ${index + 1}`} onClick={() => change((prev) => prev.filter((r) => r.key !== row.key))}>
                <X />
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={rows.length >= 20}
        onClick={() =>
          change((prev) => [
            ...prev,
            { key: newKey(), medicationId: null, medicationName: "", dosage: "", frequency: "", route: "", durationDays: "", instructions: "" },
          ])
        }
      >
        <Plus />
        Add medicine
      </Button>

      <div className="mt-4">
        <label htmlFor="rx-advice" className="text-[12px] font-semibold text-muted-foreground">
          Advice
        </label>
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

function MedicineInput({
  value,
  index,
  onChange,
}: {
  value: string;
  index: number;
  onChange: (name: string, medicationId: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [found, setFound] = React.useState<Awaited<ReturnType<typeof searchMedicationsAction>>>([]);

  React.useEffect(() => {
    if (value.trim().length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const rows = await searchMedicationsAction(value);
      if (!stale) setFound(rows);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value]);

  const label = (m: (typeof found)[number]) =>
    [m.name, m.strength, m.form].filter(Boolean).join(" ");

  return (
    <div className="relative">
      <Input
        aria-label={`Medicine ${index + 1}`}
        placeholder="Medicine"
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        maxLength={120}
        autoComplete="off"
      />
      {open && value.trim().length >= 2 && found.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-overlay">
          {found.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(label(m), m.id);
                  setOpen(false);
                }}
              >
                {label(m)}
                {m.genericName && m.genericName !== m.name && (
                  <span className="text-muted-foreground"> · {m.genericName}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "saving") {
    return <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Saving…</span>;
  }
  if (state.kind === "saved") {
    return <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Check className="size-3 text-success" />Prescription saved</span>;
  }
  if (state.kind === "error") {
    return <span role="alert" className="text-[12px] text-destructive">{state.message}</span>;
  }
  return null;
}

function IssuedPrescription({ visitId, prescription }: { visitId: string; prescription: PrescriptionView }) {
  if (prescription.items.length === 0) {
    return (
      <Card className="p-5 text-[13px] text-muted-foreground">
        No prescription for this visit.
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-[15px] font-semibold">
          <Pill className="size-4 text-muted-foreground" />
          Prescription
          <Badge variant={prescription.status === "ISSUED" ? "success" : "muted"}>
            {prescription.status === "ISSUED" ? "Issued" : "Draft"}
          </Badge>
          <span className="font-mono text-[12px] font-normal text-muted-foreground">{prescription.prescriptionNo}</span>
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
          <li key={item.id} className="text-[13px]">
            <span className="font-semibold">{i + 1}. {item.medicationName}</span>
            <span className="text-muted-foreground">
              {[item.dosage, item.frequency, item.durationDays ? `${item.durationDays} days` : null, item.instructions]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join("")}
            </span>
          </li>
        ))}
      </ol>
      {prescription.advice && <p className="mt-3 text-[13px]"><span className="font-semibold">Advice:</span> {prescription.advice}</p>}
    </Card>
  );
}
