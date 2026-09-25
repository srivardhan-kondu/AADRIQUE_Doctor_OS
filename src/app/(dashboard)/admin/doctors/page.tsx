import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Settings2, Stethoscope } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { AddDoctorDialog } from "@/components/doctors/add-doctor-dialog";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listDepartments, listDoctors } from "@/server/services/admin";

export const metadata: Metadata = { title: "Doctors" };

export const dynamic = "force-dynamic";

export default function DoctorsPage() {
  return (
    <PageBody>
      <Suspense fallback={<DirectorySkeleton />}>
        <DoctorsScreen />
      </Suspense>
    </PageBody>
  );
}

async function DoctorsScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ADMIN_MANAGE)) {
    return (
      <NoAccess
        title="Doctors"
        what="to manage the doctor directory"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const [doctors, departments] = await Promise.all([
    listDoctors(actor),
    listDepartments(actor),
  ]);
  const online = doctors.filter((d) => d.online).length;

  return (
    <>
      <PageHeader
        title="Doctors"
        description={`${doctors.length} practising here · ${online} online now`}
        actions={
          <AddDoctorDialog
            departments={departments
              .filter((d) => d.active)
              .map((d) => ({ id: d.id, name: d.name }))}
          />
        }
      />

      {doctors.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={Stethoscope}
            title="No doctors yet"
            description="Add the first doctor, then set their clinic hours so patients can be booked."
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {doctors.map((doctor) => (
            <Card key={doctor.id} className="p-0">
              <CardHeader className="flex-row items-start gap-3 border-b border-border">
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback>{initials(doctor.name)}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{doctor.name}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-semibold",
                        doctor.online ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          doctor.online ? "bg-success" : "bg-muted-foreground/50",
                        )}
                      />
                      {doctor.online ? "Online" : "Offline"}
                    </span>
                  </CardTitle>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {[doctor.department, doctor.specialization]
                      .filter(Boolean)
                      .join(" · ") || "No department set"}
                  </p>
                </div>

                <Badge variant="muted" className="shrink-0 font-mono">
                  {doctor.tokenPrefix}
                </Badge>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link href={`/admin/doctors/${doctor.id}`}>
                    <Settings2 />
                    Manage
                  </Link>
                </Button>
              </CardHeader>

              <div className="space-y-3 px-5 py-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
                  <Field label="Slot" value={`${doctor.consultationMinutes} min`} />
                  <Field
                    label="Today"
                    value={`${doctor.todayBooked} booked`}
                  />
                  <Field label="30 days" value={`${doctor.visits30d} seen`} />
                  <Field
                    label="Walk-ins"
                    value={doctor.acceptsWalkIns ? "Accepted" : "No"}
                  />
                </dl>

                {(doctor.qualifications || doctor.registrationNo) && (
                  <p className="text-[12px] text-muted-foreground">
                    {doctor.qualifications}
                    {doctor.registrationNo && (
                      <>
                        <span aria-hidden> · </span>
                        Reg <span className="font-mono">{doctor.registrationNo}</span>
                      </>
                    )}
                    {doctor.experienceYears !== null && (
                      <>
                        <span aria-hidden> · </span>
                        {doctor.experienceYears} years
                      </>
                    )}
                  </p>
                )}

                <div>
                  <p className="text-[12px] font-medium text-muted-foreground">
                    Clinic hours
                  </p>
                  {doctor.availability.length === 0 ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      No recurring availability set — nothing can be booked.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {doctor.availability.map((slot) => (
                        <li
                          key={slot.day}
                          className="flex justify-between gap-3 text-[12px]"
                        >
                          <span className="text-muted-foreground">{slot.day}</span>
                          <span className="tabular">{slot.hours}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold tabular">{value}</dd>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </>
  );
}
