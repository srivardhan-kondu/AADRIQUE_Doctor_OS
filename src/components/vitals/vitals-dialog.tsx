"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, LoaderCircle } from "lucide-react";
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
import { recordVitalsAction } from "@/app/(dashboard)/vitals-actions";

/** Spec §5.1 — the vitals form, the same at the nurse's station and in the consultation. */

const FIELDS = [
  { key: "systolicBp", label: "BP systolic", unit: "mmHg", step: "1", placeholder: "120" },
  { key: "diastolicBp", label: "BP diastolic", unit: "mmHg", step: "1", placeholder: "80" },
  { key: "pulseBpm", label: "Pulse", unit: "bpm", step: "1", placeholder: "72" },
  { key: "temperatureC", label: "Temperature", unit: "°C", step: "0.1", placeholder: "36.8" },
  { key: "spo2", label: "SpO₂", unit: "%", step: "1", placeholder: "98" },
  { key: "respiratoryRate", label: "Respiratory rate", unit: "/min", step: "1", placeholder: "16" },
  { key: "weightKg", label: "Weight", unit: "kg", step: "0.1", placeholder: "64" },
  { key: "heightCm", label: "Height", unit: "cm", step: "0.5", placeholder: "165" },
  { key: "bloodGlucose", label: "Blood glucose", unit: "mg/dL", step: "1", placeholder: "Random" },
] as const;

type Key = (typeof FIELDS)[number]["key"];

export function VitalsDialog({
  target,
  patientName,
  trigger,
}: {
  target: { queueEntryId: string } | { visitId: string };
  patientName: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Partial<Record<Key, string>>>({});
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const num = (key: Key) => {
    const raw = values[key]?.trim();
    return raw ? Number(raw) : null;
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordVitalsAction({
        target,
        heightCm: num("heightCm"),
        weightKg: num("weightKg"),
        temperatureC: num("temperatureC"),
        pulseBpm: num("pulseBpm"),
        respiratoryRate: num("respiratoryRate"),
        systolicBp: num("systolicBp"),
        diastolicBp: num("diastolicBp"),
        spo2: num("spo2"),
        bloodGlucose: num("bloodGlucose"),
        notes: notes.trim() || null,
      });
      if (!result.ok) return setError(result.message ?? "Could not save.");
      toast.success(
        result.flags?.length ? `Vitals saved · ${result.flags.join(", ")}` : "Vitals saved",
      );
      setOpen(false);
      setValues({});
      setNotes("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" aria-label={`Record vitals for ${patientName}`}>
            <HeartPulse />
            Record vitals
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vitals · {patientName}</DialogTitle>
          <DialogDescription>Fill in what you measured; leave the rest empty.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-[12px] font-medium text-muted-foreground">
                {f.label} <span className="font-normal">({f.unit})</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step={f.step}
                  min={0}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-1"
                />
              </label>
            ))}
          </div>
          <label className="block text-[12px] font-medium text-muted-foreground">
            Notes
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Measured seated, after rest"
              className="mt-1"
            />
          </label>
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
              Save vitals
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
