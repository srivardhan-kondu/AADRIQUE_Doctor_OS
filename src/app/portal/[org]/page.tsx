import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Ticket } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CancelAppointment,
  PatientChooser,
  PortalSignIn,
  PortalSignOut,
  RateVisit,
} from "@/components/portal/portal-client";
import { loadPortal } from "@/server/portal-session";
import { portalHome } from "@/server/services/portal";

export const dynamic = "force-dynamic";

const when = (d: Date) =>
  d.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const day = (d: Date) =>
  d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/**
 * Spec §3 — what a patient needs from the clinic between visits: their
 * appointments, their place in today's queue, their follow-ups, and a way to
 * say how the last visit went.
 */
export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const loaded = await loadPortal(org);
  if (!loaded) notFound();
  const { organization, portal } = loaded;

  const header = (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Logo />
        <p className="font-display font-semibold">{organization.name}</p>
      </div>
      {portal && <PortalSignOut slug={organization.slug} />}
    </div>
  );

  if (!portal) {
    return (
      <>
        {header}
        <h1 className="font-display text-2xl font-bold tracking-tight">Your appointments</h1>
        <p className="mb-6 mt-1 text-[15px] text-muted-foreground">
          Book, check or cancel an appointment, and follow your token on the day.
        </p>
        <Card className="p-5">
          <PortalSignIn slug={organization.slug} />
        </Card>
      </>
    );
  }

  if (!portal.patient) {
    return (
      <>
        {header}
        <h1 className="font-display text-2xl font-bold tracking-tight">Who is this for?</h1>
        <p className="mb-5 mt-1 text-[15px] text-muted-foreground">
          More than one person is registered with this number.
        </p>
        <PatientChooser slug={organization.slug} patients={portal.patients} />
      </>
    );
  }

  const home = await portalHome(organization.id, portal.patient.id);

  return (
    <>
      {header}
      <h1 className="font-display text-2xl font-bold tracking-tight">
        Hello, {portal.patient.firstName}
      </h1>
      {portal.patients.length > 1 && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Signed in for {portal.patient.name}.
        </p>
      )}

      <div className="mt-6 space-y-5">
        {home.token && (
          <Card className="flex items-center gap-4 border-accent/40 bg-accent-soft/40 p-5">
            <Ticket className="size-6 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-muted-foreground">Your token today</p>
              <p className="font-mono text-2xl font-bold">{home.token.token}</p>
              <p className="text-[13px] text-muted-foreground">{home.token.doctorName}</p>
            </div>
            {home.token.statusPath && (
              <Button asChild>
                <Link href={home.token.statusPath}>Follow the queue</Link>
              </Button>
            )}
          </Card>
        )}

        <Button asChild size="lg" variant="accent" className="w-full">
          <Link href={`/portal/${organization.slug}/book`}>
            <CalendarPlus />
            Book an appointment
          </Link>
        </Button>

        <Section title="Upcoming">
          {home.upcoming.length === 0 ? (
            <Empty>Nothing booked.</Empty>
          ) : (
            home.upcoming.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{when(a.start)}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {a.doctorName}
                    {a.department ? ` · ${a.department}` : ""}
                  </p>
                </div>
                {a.canCancel && (
                  <CancelAppointment slug={organization.slug} appointmentId={a.id} when={when(a.start)} />
                )}
              </li>
            ))
          )}
        </Section>

        {home.followUps.length > 0 && (
          <Section title="Follow-ups">
            {home.followUps.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <p className="text-[15px] font-semibold">Due {day(f.dueDate)}</p>
                <p className="text-[13px] text-muted-foreground">
                  {f.reason ?? "Review"} · {f.doctorName}
                </p>
              </li>
            ))}
          </Section>
        )}

        {home.feedback.length > 0 && (
          <Section title="How was your visit?">
            {home.feedback.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <p className="mb-2 text-[14px]">
                  {f.doctorName} · {day(f.visitDate)}
                </p>
                <RateVisit slug={organization.slug} feedbackId={f.id} doctorName={f.doctorName} />
              </li>
            ))}
          </Section>
        )}

        {home.past.length > 0 && (
          <Section title="Past visits">
            {home.past.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
                <span>{day(a.start)} · {a.doctorName}</span>
                <span className="text-[12px] text-muted-foreground">
                  {a.status === "COMPLETED" ? "Seen" : a.status.toLowerCase().replace("_", " ")}
                </span>
              </li>
            ))}
          </Section>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <Card className="p-0">
        <ul className="divide-y divide-border">{children}</ul>
      </Card>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-4 py-4 text-[14px] text-muted-foreground">{children}</li>;
}
