import type { Metadata } from "next";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PatientList } from "@/components/patients/patient-list";
import { PatientSearch } from "@/components/patients/patient-search";
import { RegisterPatientDialog } from "@/components/reception/register-dialog";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { searchPatients } from "@/server/services/patients";

export const metadata: Metadata = { title: "Patients" };

/**
 * The facility-wide patient directory (spec §22 — inside the tenant
 * boundary), with registration and an audited export.
 */
export default async function AdminPatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.PATIENT_READ)) {
    return (
      <NoAccess
        title="Patients"
        what="to open the patient directory"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Patients"
        description="The directory for your organisation. Search by name, mobile number, patient ID or appointment ID."
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground lg:flex">
              Focus search <Kbd>/</Kbd>
            </span>
            {hasPermission(actor, Permission.ADMIN_MANAGE) && (
              <Button asChild variant="outline">
                {/* A plain download link: the route logs the export first. */}
                <a href="/admin/patients/export" download>
                  <Download />
                  Export directory
                </a>
              </Button>
            )}
            {hasPermission(actor, Permission.PATIENT_CREATE) && (
              <RegisterPatientDialog />
            )}
          </>
        }
      />

      <div className="space-y-4">
        <PatientSearch initial={q} />
        <Card className="overflow-hidden">
          <Suspense key={q} fallback={<ListSkeleton />}>
            <Results query={q.trim().slice(0, 120)} />
          </Suspense>
        </Card>
        {hasPermission(actor, Permission.ADMIN_MANAGE) && (
          <p className="text-[12px] text-muted-foreground">
            Exports contain identity, contact and consent only — no clinical
            content — and each one is recorded in the audit log.
          </p>
        )}
      </div>
    </PageBody>
  );
}

async function Results({ query }: { query: string }) {
  const actor = await requireActor();
  const patients = await searchPatients(actor, query, 50);

  return (
    <>
      <div className="border-b border-border px-5 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          {query
            ? `${patients.length} ${patients.length === 1 ? "match" : "matches"}`
            : "Most recently seen"}
        </p>
      </div>
      <PatientList
        patients={patients}
        query={query}
        hrefBase="/admin/patients"
        showClinical={hasPermission(actor, Permission.CONSULTATION_READ)}
      />
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
