import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Droplet,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBody } from "@/components/shell/page-header";
import { PatientTimeline } from "@/components/patients/patient-timeline";
import type { Patient360 } from "@/server/services/patients";

const BLOOD_GROUP_LABEL: Record<string, string> = {
  A_POSITIVE: "A+",
  A_NEGATIVE: "A−",
  B_POSITIVE: "B+",
  B_NEGATIVE: "B−",
  AB_POSITIVE: "AB+",
  AB_NEGATIVE: "AB−",
  O_POSITIVE: "O+",
  O_NEGATIVE: "O−",
  UNKNOWN: "Unknown",
};

/**
 * Spec §7 — Patient 360, shared by every workspace that opens a patient.
 *
 * The service decides what the viewer may see: without clinical access the
 * record arrives with no consultations, prescriptions, labs, allergies or
 * conditions in it. `clinical` only decides whether to draw the panels that
 * would otherwise sit empty.
 */
export function Patient360View({
  patient,
  clinical,
  back,
  actions,
}: {
  patient: Patient360;
  clinical: boolean;
  back: { href: string; label: string };
  /** What this workspace does next — the desk books and issues tokens. */
  actions?: React.ReactNode;
}) {
  const criticalAllergies = patient.allergies.filter(
    (a) => a.severity === "HIGH" || a.severity === "CRITICAL",
  );

  return (
    <PageBody>
      {/* Spec §7 — the header reads as a profile, not a form. */}
      <header className="mb-5 flex flex-wrap items-start gap-5 rounded-xl border border-border bg-card p-5 shadow-soft">
        <Avatar className="size-16 shrink-0">
          <AvatarFallback className="text-lg">
            {initials(patient.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight">
            {patient.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
            <span data-numeric className="font-mono">
              {patient.mrn}
            </span>
            <span aria-hidden>·</span>
            {patient.age !== null && (
              <>
                <span data-numeric>{patient.age} years</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="capitalize">{patient.gender.toLowerCase()}</span>
            {patient.bloodGroup !== "UNKNOWN" && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Droplet className="size-3.5" />
                  {BLOOD_GROUP_LABEL[patient.bloodGroup] ?? patient.bloodGroup}
                </span>
              </>
            )}
          </p>

          <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field icon={Phone} label="Phone" value={patient.phone} numeric />
            <Field
              icon={CalendarClock}
              label="Last visit"
              value={formatDate(patient.lastVisitAt) ?? "No visits yet"}
            />
            <Field
              icon={CalendarClock}
              label="Next follow-up"
              value={formatDate(patient.nextFollowUpAt) ?? "None scheduled"}
            />
            {patient.email && (
              <Field icon={Mail} label="Email" value={patient.email} />
            )}
            {patient.address && (
              <Field icon={MapPin} label="Address" value={patient.address} />
            )}
            {patient.emergencyContact && (
              <Field
                icon={UserRound}
                label="Emergency contact"
                value={`${patient.emergencyContact.name} · ${patient.emergencyContact.phone}`}
              />
            )}
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            {actions}
            <Button asChild variant={actions ? "outline" : "default"}>
              <Link href={back.href}>{back.label}</Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {patient.flags.map((flag) => (
              <Badge key={flag.id} variant="outline">
                {flag.label}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      {/* Spec §6 — allergies are a safety flag, so they lead. */}
      {criticalAllergies.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-destructive">
              {criticalAllergies.length === 1
                ? "Recorded allergy"
                : "Recorded allergies"}
            </p>
            <p className="mt-0.5 text-[12px] text-destructive/90">
              {criticalAllergies
                .map((a) => (a.reaction ? `${a.substance} (${a.reaction})` : a.substance))
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <SummaryCard patient={patient} clinical={clinical} />
          {clinical && <ClinicalCard patient={patient} />}
        </aside>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Timeline</CardTitle>
              <p className="mt-1 text-[13px] text-muted-foreground">
                The whole patient story, newest first
              </p>
            </div>
          </CardHeader>
          <PatientTimeline events={patient.timeline} />
        </Card>
      </div>
    </PageBody>
  );
}

function Field({
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
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </dt>
      <dd
        {...(numeric ? { "data-numeric": true } : {})}
        className="mt-0.5 truncate text-[13px]"
      >
        {value}
      </dd>
    </div>
  );
}

function SummaryCard({
  patient,
  clinical,
}: {
  patient: Patient360;
  clinical: boolean;
}) {
  const stats = [
    { label: "Visits", value: patient.counts.visits },
    ...(clinical
      ? [
          { label: "Prescriptions", value: patient.counts.prescriptions },
          { label: "Lab reports", value: patient.counts.labReports },
        ]
      : []),
    { label: "Messages", value: patient.counts.messages },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>At a glance</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dd
                data-numeric
                className="font-display text-2xl font-bold leading-none"
              >
                {stat.value}
              </dd>
              <dt className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ClinicalCard({ patient }: { patient: Patient360 }) {
  const hasNothing =
    patient.allergies.length === 0 && patient.conditions.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinical flags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasNothing && (
          <p className="text-[13px] text-muted-foreground">
            No allergies or chronic conditions recorded.
          </p>
        )}

        {patient.allergies.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <AlertTriangle className="size-3" />
              Allergies
            </p>
            <ul className="space-y-1.5">
              {patient.allergies.map((allergy) => (
                <li key={allergy.id} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      allergy.severity === "CRITICAL" || allergy.severity === "HIGH"
                        ? "bg-destructive"
                        : "bg-warning",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">
                      {allergy.substance}
                    </span>
                    {allergy.reaction && (
                      <span className="block text-[11px] text-muted-foreground">
                        {allergy.reaction} · {allergy.severity.toLowerCase()}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {patient.conditions.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Activity className="size-3" />
              Chronic conditions
            </p>
            <ul className="space-y-1.5">
              {patient.conditions.map((condition) => (
                <li key={condition.id}>
                  <span className="block text-[13px] font-medium">
                    {condition.name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {condition.code && <span className="font-mono">{condition.code}</span>}
                    {condition.code && condition.since && " · "}
                    {condition.since && `since ${condition.since.getFullYear()}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
