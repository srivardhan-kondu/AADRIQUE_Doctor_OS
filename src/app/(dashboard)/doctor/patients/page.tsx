import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PatientList } from "@/components/patients/patient-list";
import { PatientSearch } from "@/components/patients/patient-search";
import { RegisterPatientDialog } from "@/components/reception/register-dialog";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { searchPatients } from "@/server/services/patients";

export const metadata: Metadata = { title: "Patients" };

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const actor = await requireActor();

  return (
    <PageBody>
      <PageHeader
        title="Patients"
        description="Search by name, mobile number or patient ID. Results appear as you type."
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
              Focus search <Kbd>/</Kbd>
            </span>
            {hasPermission(actor, Permission.PATIENT_CREATE) && (
              <RegisterPatientDialog openParam="register" />
            )}
          </>
        }
      />

      <div className="space-y-4">
        <PatientSearch initial={q} />

        <Card className="overflow-hidden">
          <Suspense key={q} fallback={<ListSkeleton />}>
            <Results query={q} />
          </Suspense>
        </Card>
      </div>
    </PageBody>
  );
}

async function Results({ query }: { query: string }) {
  const actor = await requireActor();
  const patients = await searchPatients(actor, query);

  return (
    <>
      <div className="border-b border-border px-5 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          {query
            ? `${patients.length} ${patients.length === 1 ? "match" : "matches"}`
            : "Recently seen"}
        </p>
      </div>
      <PatientList patients={patients} query={query} />
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
