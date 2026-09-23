import type { Metadata } from "next";
import { Suspense } from "react";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody } from "@/components/shell/page-header";
import { OnDutySwitch, PracticeSettings } from "@/components/doctors/doctor-settings";
import { WeekEditor } from "@/components/doctors/week-editor";
import { requireActor, requireDoctorId } from "@/server/context";
import { getDoctorProfile } from "@/server/services/doctors";

export const metadata: Metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

/**
 * Spec §11 + §12 — the doctor's profile, working week and how the queue
 * treats their time. Everything a doctor can change about being bookable,
 * without going through an administrator.
 */
export default function ProfilePage() {
  return (
    <PageBody className="max-w-[1200px]">
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile />
      </Suspense>
    </PageBody>
  );
}

async function Profile() {
  const actor = await requireActor();
  const doctorId = await requireDoctorId(actor);
  const profile = await getDoctorProfile(actor, doctorId);
  const own = actor.doctorId === profile.id;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-5 shadow-soft">
        <Avatar className="size-16 shrink-0">
          <AvatarFallback className="text-lg">{initials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {profile.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
            {[profile.department?.name, profile.specialization]
              .filter(Boolean)
              .join(" · ") || "No department set"}
            <Badge variant="muted" className="font-mono">
              Tokens {profile.tokenPrefix}
            </Badge>
          </p>
        </div>
        {profile.canEdit && (
          <OnDutySwitch doctorId={profile.id} online={profile.online} />
        )}
      </header>

      {!own && (
        <p className="mb-5 rounded-lg bg-muted px-4 py-2.5 text-[13px] text-muted-foreground">
          You are viewing {profile.name}&apos;s profile.
          {profile.canEdit
            ? " As an administrator you can change it."
            : " Only they or an administrator can change it."}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <dl className="space-y-3 px-5 pb-5 text-[13px]">
              <Detail label="Email" value={profile.email} />
              <Detail label="Qualifications" value={profile.qualifications} />
              <Detail label="Registration no." value={profile.registrationNo} mono />
              <Detail
                label="Experience"
                value={
                  profile.experienceYears !== null
                    ? `${profile.experienceYears} years`
                    : null
                }
              />
            </dl>
          </Card>

          <PracticeSettings
            doctorId={profile.id}
            consultationMinutes={profile.consultationMinutes}
            acceptsWalkIns={profile.acceptsWalkIns}
            canEdit={profile.canEdit}
          />
        </div>

        <WeekEditor
          doctorId={profile.id}
          week={profile.week}
          canEdit={profile.canEdit}
        />
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "mt-0.5 font-mono" : "mt-0.5"}>
        {value ?? <span className="text-muted-foreground">Not recorded</span>}
      </dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <Skeleton className="mb-5 h-[106px] rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-[480px] rounded-xl" />
      </div>
    </>
  );
}
