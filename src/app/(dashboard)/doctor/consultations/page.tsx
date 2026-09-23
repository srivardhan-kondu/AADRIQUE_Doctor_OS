import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, FileCheck2, FilePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PatientSearch } from "@/components/patients/patient-search";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor, requireDoctorId } from "@/server/context";
import { listConsultations } from "@/server/services/consultation";

export const metadata: Metadata = { title: "Consultations" };

export const dynamic = "force-dynamic";

type Show = "unsigned" | "signed" | undefined;

interface PageProps {
  searchParams: Promise<{ show?: string; q?: string }>;
}

/**
 * Spec §6 + §26 — the doctor's consultations as a worklist.
 *
 * Unsigned notes lead, because an unsigned note is unfinished clinical work;
 * one from a previous day is called out. Each row opens the workspace.
 */
export default function ConsultationsPage({ searchParams }: PageProps) {
  return (
    <PageBody>
      <Suspense fallback={<ListSkeleton />}>
        <Worklist searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

async function Worklist({ searchParams }: PageProps) {
  const params = await searchParams;
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.CONSULTATION_READ)) {
    return <NoAccess title="Consultations" what="to read consultation notes" />;
  }

  const show: Show =
    params.show === "unsigned" || params.show === "signed" ? params.show : undefined;
  const query = (params.q ?? "").trim().slice(0, 120);
  const doctorId = await requireDoctorId(actor);
  const { rows, counts } = await listConsultations(actor, doctorId, {
    show,
    query,
  });

  return (
    <>
      <PageHeader
        title="Consultations"
        description={
          counts.unsigned === 0
            ? `Every note is signed · ${counts.signed30d} signed in the last 30 days`
            : `${counts.unsigned} unsigned${counts.overdue ? ` · ${counts.overdue} from earlier days` : ""} · ${counts.signed30d} signed in the last 30 days`
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="flex gap-1 text-[13px]" aria-label="Filter consultations">
          <Tab href={hrefFor(undefined, query)} active={!show}>
            All
          </Tab>
          <Tab href={hrefFor("unsigned", query)} active={show === "unsigned"}>
            Unsigned
            {counts.unsigned > 0 && (
              <Badge variant={counts.overdue ? "destructive" : "accent"}>
                {counts.unsigned}
              </Badge>
            )}
          </Tab>
          <Tab href={hrefFor("signed", query)} active={show === "signed"}>
            Signed
          </Tab>
        </nav>
        <div className="min-w-64 flex-1">
          <PatientSearch initial={query} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={show === "unsigned" ? FileCheck2 : FilePen}
            title={
              query
                ? `No consultation matches “${query}”`
                : show === "unsigned"
                  ? "Nothing waiting for your signature"
                  : "No consultations yet"
            }
            description={
              query
                ? "Try the patient's mobile number or patient ID."
                : "Call a patient from your queue and their consultation opens here as a draft."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.visitId}>
                <Link
                  href={`/doctor/consultations/${row.visitId}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-muted",
                    row.overdue && "bg-destructive-soft/40",
                  )}
                >
                  <div className="w-24 shrink-0">
                    <p className="text-[13px] font-semibold tabular">
                      {row.startedAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular">
                      {row.startedAt.toLocaleTimeString("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">
                        {row.patientName}
                      </span>
                      <span data-numeric className="font-mono text-[12px] text-muted-foreground">
                        {row.patientMrn}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                      {row.assessment ?? row.chiefComplaint ?? "No complaint recorded"}
                    </p>
                  </div>

                  {row.status === "SIGNED" ? (
                    <Badge variant="success">
                      <FileCheck2 />
                      Signed
                    </Badge>
                  ) : row.overdue ? (
                    <Badge variant="destructive">
                      <FilePen />
                      Unsigned · earlier day
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <FilePen />
                      {row.status === "REVIEWED" ? "Reviewed, unsigned" : "Draft"}
                    </Badge>
                  )}

                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function hrefFor(show: Show, query: string): string {
  const params = new URLSearchParams();
  if (show) params.set("show", show);
  if (query) params.set("q", query);
  const qs = params.toString();
  return qs ? `/doctor/consultations?${qs}` : "/doctor/consultations";
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-soft"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function ListSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Skeleton className="mb-4 h-11 rounded-lg" />
      <div className="space-y-px overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-none" />
        ))}
      </div>
    </>
  );
}
