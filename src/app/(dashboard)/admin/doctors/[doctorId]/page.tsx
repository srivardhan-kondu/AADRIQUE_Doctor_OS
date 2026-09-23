import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody } from "@/components/shell/page-header";
import { PracticeSettings } from "@/components/doctors/doctor-settings";
import { WeekEditor } from "@/components/doctors/week-editor";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listDepartments } from "@/server/services/admin";
import { getDoctorProfile } from "@/server/services/doctors";
import { ServiceError } from "@/server/services/errors";

export const metadata: Metadata = { title: "Doctor" };

export const dynamic = "force-dynamic";

/**
 * Spec §53 (admin journey) — assign a department and configure a doctor's
 * schedule. The same editor the doctor uses on their own profile.
 */
export default async function AdminDoctorPage({
  params,
}: {
  params: Promise<{ doctorId: string }>;
}) {
  const { doctorId } = await params;
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ADMIN_MANAGE)) {
    return (
      <NoAccess
        title="Doctor"
        what="to manage doctors"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  let profile;
  try {
    profile = await getDoctorProfile(actor, doctorId);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const departments = await listDepartments(actor);

  return (
    <PageBody className="max-w-[1200px]">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/admin/doctors" aria-label="Back to doctors">
            <ArrowLeft />
          </Link>
        </Button>
        <Avatar className="size-12">
          <AvatarFallback>{initials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold tracking-tight">
            {profile.name}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {profile.email}
            <Badge variant="muted" className="font-mono">
              Tokens {profile.tokenPrefix}
            </Badge>
            <Badge variant={profile.online ? "success" : "muted"}>
              {profile.online ? "On duty" : "Away"}
            </Badge>
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <PracticeSettings
          doctorId={profile.id}
          consultationMinutes={profile.consultationMinutes}
          acceptsWalkIns={profile.acceptsWalkIns}
          departments={departments
            .filter((d) => d.active)
            .map((d) => ({ id: d.id, name: d.name }))}
          departmentId={profile.department?.id ?? null}
          canEdit={profile.canEdit}
        />
        <WeekEditor
          doctorId={profile.id}
          week={profile.week}
          canEdit={profile.canEdit}
        />
      </div>
    </PageBody>
  );
}
