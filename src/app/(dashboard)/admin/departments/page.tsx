import type { Metadata } from "next";
import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { ThresholdForm } from "@/components/admin/threshold-form";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listDepartments } from "@/server/services/admin";

export const metadata: Metadata = { title: "Departments" };

export const dynamic = "force-dynamic";

export default function DepartmentsPage() {
  return (
    <PageBody>
      <Suspense fallback={<DepartmentsSkeleton />}>
        <DepartmentsScreen />
      </Suspense>
    </PageBody>
  );
}

async function DepartmentsScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ADMIN_MANAGE)) {
    return (
      <NoAccess
        title="Departments"
        what="to manage departments"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const departments = await listDepartments(actor);

  return (
    <>
      <PageHeader
        title="Departments"
        description="The wait threshold and queue capacity every warning in the product is measured against."
      />

      {departments.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={Building2}
            title="No departments yet"
            description="Departments group doctors, queues and appointments inside a facility."
          />
        </Card>
      ) : (
        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Queue limits</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              A long wait means something different in paediatrics than in
              orthopaedics, so each department carries its own numbers.
            </p>
          </CardHeader>

          <ul className="divide-y divide-border">
            {departments.map((department) => (
              <li
                key={department.id}
                className="flex flex-wrap items-end justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold">
                      {department.name}
                    </span>
                    <Badge variant="muted" className="font-mono">
                      {department.code}
                    </Badge>
                    {!department.active && <Badge variant="outline">Inactive</Badge>}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {department.facility}
                    <span aria-hidden> · </span>
                    <span className="tabular">{department.doctorCount}</span>{" "}
                    {department.doctorCount === 1 ? "doctor" : "doctors"}
                    <span aria-hidden> · </span>
                    <span className="tabular">{department.visits30d}</span> seen in
                    30 days
                  </p>
                </div>

                <ThresholdForm
                  departmentId={department.id}
                  waitThresholdMinutes={department.waitThresholdMinutes}
                  queueCapacity={department.queueCapacity}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function DepartmentsSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </>
  );
}
