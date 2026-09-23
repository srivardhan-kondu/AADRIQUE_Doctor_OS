import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FlaskConical, Pill, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody } from "@/components/shell/page-header";
import { ConsultationEditor } from "@/components/consultation/consultation-editor";
import { PatientSnapshot } from "@/components/consultation/patient-snapshot";
import { PreConsultationBrief } from "@/components/ai/pre-consultation-brief";
import { requireActor } from "@/server/context";
import { getConsultationWorkspace } from "@/server/services/consultation";
import { ServiceError } from "@/server/services/errors";

/**
 * The title and the page both need the workspace. `cache` makes that one read
 * per request rather than loading the whole visit twice.
 */
const loadWorkspace = cache(async (visitId: string) =>
  getConsultationWorkspace(await requireActor(), visitId),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ visitId: string }>;
}): Promise<Metadata> {
  const { visitId } = await params;
  try {
    const ws = await loadWorkspace(visitId);
    return { title: `Consultation · ${ws.patient.name}` };
  } catch {
    return { title: "Consultation" };
  }
}

export const dynamic = "force-dynamic";

/**
 * Spec §6 — the consultation workspace.
 *
 * Three panels: patient snapshot, the note, and the AI Copilot (which lives in
 * the shell so it keeps its context across screens). The doctor never has to
 * leave this page to see history, vitals, medications or orders.
 */
export default async function ConsultationPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;

  let ws;
  try {
    ws = await loadWorkspace(visitId);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <PageBody className="max-w-[1500px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/doctor/queue" aria-label="Back to queue">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">
              Consultation
            </h1>
            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
              <span data-numeric className="font-mono">
                {ws.visitNumber}
              </span>
              <span aria-hidden>·</span>
              <span data-numeric>
                {ws.startedAt.toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span aria-hidden>·</span>
              <span>{ws.doctorName}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <PatientSnapshot
          patient={ws.patient}
          vitals={ws.vitals}
          token={ws.token}
        />

        <div className="min-w-0">
          <Tabs defaultValue="note">
            <TabsList className="mb-4 w-full sm:w-auto">
              <TabsTrigger value="note">Note</TabsTrigger>
              <TabsTrigger value="history">
                History
                {ws.history.length > 0 && (
                  <span data-numeric className="ml-1 text-muted-foreground">
                    {ws.history.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="medications">
                Medications
                {ws.prescriptions.length > 0 && (
                  <span data-numeric className="ml-1 text-muted-foreground">
                    {ws.prescriptions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="orders">
                Orders
                {ws.labReports.length > 0 && (
                  <span data-numeric className="ml-1 text-muted-foreground">
                    {ws.labReports.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="note" className="space-y-5">
              {/* Spec §8 — the brief before the blank note. */}
              <PreConsultationBrief visitId={ws.visitId} />

              <ConsultationEditor
                visitId={ws.visitId}
                initial={ws.draft}
                status={ws.status}
                canSign={ws.canSign}
                isOwnConsultation={ws.isOwnConsultation}
                signedAt={ws.signedAt}
                signedByName={ws.signedByName}
                draftSavedAt={ws.draftSavedAt}
              />
            </TabsContent>

            <TabsContent value="history">
              <HistoryTab history={ws.history} />
            </TabsContent>

            <TabsContent value="medications">
              <MedicationsTab prescriptions={ws.prescriptions} />
            </TabsContent>

            <TabsContent value="orders">
              <OrdersTab labReports={ws.labReports} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageBody>
  );
}

type Workspace = Awaited<ReturnType<typeof getConsultationWorkspace>>;

function HistoryTab({ history }: { history: Workspace["history"] }) {
  if (history.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={TriangleAlert}
          title="No previous visits"
          description="This is the first time this patient has been seen here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((visit) => (
        <Card key={visit.visitId}>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle className="text-[14px]">
                {visit.chiefComplaint ?? "Consultation"}
              </CardTitle>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                <span data-numeric>
                  {visit.at.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span aria-hidden>·</span>
                <span>{visit.doctorName}</span>
              </p>
            </div>
            <Badge variant={visit.status === "SIGNED" ? "success" : "warning"}>
              {visit.status === "SIGNED" ? "Signed" : "Draft"}
            </Badge>
          </CardHeader>
          {(visit.assessment || visit.plan) && (
            <CardContent className="space-y-2.5 pt-0">
              {visit.assessment && (
                <Field label="Assessment" value={visit.assessment} />
              )}
              {visit.plan && <Field label="Plan" value={visit.plan} />}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function MedicationsTab({
  prescriptions,
}: {
  prescriptions: Workspace["prescriptions"];
}) {
  if (prescriptions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Pill}
          title="No prescription on this visit"
          description="Prescribing arrives with the medication module in a later part."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((rx) => (
        <Card key={rx.id}>
          <CardHeader>
            <div>
              <CardTitle className="font-mono text-[14px]">
                {rx.prescriptionNo}
              </CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground" data-numeric>
                {rx.createdAt.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border">
              {rx.items.map((item) => (
                <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-[13px] font-medium">{item.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {[
                      item.dosage,
                      item.frequency,
                      item.durationDays ? `${item.durationDays} days` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrdersTab({ labReports }: { labReports: Workspace["labReports"] }) {
  if (labReports.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={FlaskConical}
          title="No investigations on this visit"
          description="Lab ordering arrives with the integrations module in a later part."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {labReports.map((lab) => (
        <Card key={lab.id}>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle className="text-[14px]">{lab.testName}</CardTitle>
              <p className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                {lab.panel && <span>{lab.panel}</span>}
                <span aria-hidden>·</span>
                <span data-numeric>
                  {lab.at.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </p>
            </div>
            {lab.abnormal ? (
              <Badge variant="warning">
                <TriangleAlert />
                Outside range
              </Badge>
            ) : (
              <Badge variant="muted">{lab.status.replace(/_/g, " ").toLowerCase()}</Badge>
            )}
          </CardHeader>
          {lab.summary && (
            <CardContent className="pt-0">
              <p className="text-[13px] leading-relaxed">{lab.summary}</p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] leading-relaxed">{value}</p>
    </div>
  );
}
