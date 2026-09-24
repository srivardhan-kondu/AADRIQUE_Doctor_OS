import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Droplet,
  ExternalLink,
  Phone,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { VitalsDialog } from "@/components/vitals/vitals-dialog";
import type { ConsultationWorkspace } from "@/server/services/consultation";

/**
 * Spec §6 — the left panel.
 *
 * Everything a doctor must see before they write anything: who this is, what
 * they react to, and what they already live with. Allergies lead because they
 * are the one thing that changes a prescription.
 */
export function PatientSnapshot({
  patient,
  vitals,
  token,
  recordVitalsFor,
}: {
  patient: ConsultationWorkspace["patient"];
  vitals: ConsultationWorkspace["vitals"];
  token: string | null;
  /** The visit to record vitals against, when this user may. */
  recordVitalsFor?: string | null;
}) {
  const critical = patient.allergies.filter(
    (a) => a.severity === "HIGH" || a.severity === "CRITICAL",
  );

  return (
    <aside className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <Avatar className="size-12 shrink-0">
            <AvatarFallback>{initials(patient.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold leading-tight">
              {patient.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              <span data-numeric className="font-mono">
                {patient.mrn}
              </span>
              {patient.age !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span data-numeric>{patient.age}y</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="capitalize">{patient.gender.toLowerCase()}</span>
            </p>
            {token && (
              <Badge variant="accent" className="mt-2 font-mono">
                {token}
              </Badge>
            )}
          </div>
        </div>

        <dl className="mt-4 space-y-2 border-t border-border pt-3">
          <SnapshotRow icon={Phone} label="Phone" value={patient.phone} numeric />
          {patient.bloodGroup !== "UNKNOWN" && (
            <SnapshotRow
              icon={Droplet}
              label="Blood group"
              value={patient.bloodGroup.replace("_POSITIVE", "+").replace("_NEGATIVE", "−")}
            />
          )}
          <SnapshotRow
            icon={CalendarClock}
            label="Previous visit"
            value={
              patient.lastVisitAt
                ? patient.lastVisitAt.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "First visit"
            }
          />
        </dl>

        <Link
          href={`/doctor/patients/${patient.id}`}
          className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"
        >
          Open Patient 360
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {/* Allergies get their own block, in the destructive colour. */}
      {patient.allergies.length > 0 && (
        <div
          className={cn(
            "rounded-xl border p-4",
            critical.length > 0
              ? "border-destructive/30 bg-destructive-soft"
              : "border-border bg-card shadow-soft",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
              critical.length > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <AlertTriangle className="size-3" />
            Allergies
          </p>
          <ul className="mt-2 space-y-1.5">
            {patient.allergies.map((allergy) => (
              <li key={allergy.id} className="text-[13px]">
                <span className="font-medium">{allergy.substance}</span>
                {allergy.reaction && (
                  <span
                    className={cn(
                      "block text-[11px]",
                      critical.length > 0
                        ? "text-destructive/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {allergy.reaction} · {allergy.severity.toLowerCase()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {patient.conditions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Activity className="size-3" />
            Chronic conditions
          </p>
          <ul className="mt-2 space-y-1">
            {patient.conditions.map((condition) => (
              <li key={condition.id} className="text-[13px]">
                {condition.name}
                {condition.code && (
                  <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                    {condition.code}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {patient.flags.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Flags
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {patient.flags.map((flag) => (
              <Badge key={flag.id} variant="outline">
                {flag.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {vitals && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Vitals
          </p>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <Vital label="BP" value={vitals.systolicBp && vitals.diastolicBp ? `${vitals.systolicBp}/${vitals.diastolicBp}` : null} unit="mmHg" />
            <Vital label="Pulse" value={vitals.pulseBpm} unit="bpm" />
            <Vital label="Temp" value={vitals.temperatureC} unit="°C" />
            <Vital label="SpO₂" value={vitals.spo2} unit="%" />
            <Vital label="Weight" value={vitals.weightKg} unit="kg" />
            <Vital label="Height" value={vitals.heightCm} unit="cm" />
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Recorded{" "}
            {vitals.recordedAt.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
            {vitals.recordedBy && ` · ${vitals.recordedBy}`}
          </p>
        </div>
      )}

      {recordVitalsFor && (
        <VitalsDialog target={{ visitId: recordVitalsFor }} patientName={patient.name} />
      )}
    </aside>
  );
}

function SnapshotRow({
  icon: Icon,
  label,
  value,
  numeric,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </dt>
      <dd
        {...(numeric ? { "data-numeric": true } : {})}
        className="truncate text-[12px] font-medium"
      >
        {value}
      </dd>
    </div>
  );
}

function Vital({
  label,
  value,
  unit,
}: {
  label: string;
  /** Blood pressure arrives pre-composed as "120/80"; the rest are numbers. */
  value: number | string | null;
  unit: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd data-numeric className="mt-0.5 text-[13px] font-semibold">
        {value ?? "—"}
        {value !== null && (
          <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}
