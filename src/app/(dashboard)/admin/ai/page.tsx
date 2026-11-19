import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import {
  AddKnowledgeDocumentDialog,
  RemoveKnowledgeDocumentButton,
} from "@/components/admin/knowledge-controls";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listAIActivity } from "@/server/services/ai";
import { listKnowledgeDocuments } from "@/server/services/knowledge";

export const metadata: Metadata = { title: "AI" };

export const dynamic = "force-dynamic";

export default function AdminAIPage() {
  return (
    <PageBody>
      <Suspense fallback={<AISkeleton />}>
        <AIScreen />
      </Suspense>
    </PageBody>
  );
}

const TYPE_LABEL: Record<string, string> = {
  PRE_CONSULTATION_BRIEF: "Pre-consultation brief",
  PATIENT_SUMMARY: "Patient summary",
  CONSULTATION_NOTE_DRAFT: "Note draft",
  FOLLOW_UP_MESSAGE: "Follow-up message",
  HISTORY_SEARCH: "History search",
  KNOWLEDGE_ANSWER: "Knowledge answer",
  MISSING_DOCUMENTATION: "Documentation check",
};

async function AIScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.AI_MANAGE)) {
    return (
      <NoAccess
        title="AI"
        what="to manage the AI assistant"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const [activity, documents] = await Promise.all([
    listAIActivity(actor, 20),
    listKnowledgeDocuments(actor),
  ]);

  return (
    <>
      <PageHeader
        title="AI"
        description="The clinic documents the assistant answers from, and what it has produced for your doctors."
        actions={<AddKnowledgeDocumentDialog />}
      />

      {/* Spec §10 — the safety posture, stated on the screen that governs it. */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-[13px] leading-relaxed text-muted-foreground">
          The assistant only summarises and drafts from your own records and
          documents, and shows where each answer came from. It never diagnoses,
          never changes a clinical record, and nothing reaches a patient until a
          doctor accepts it.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Card className="min-w-0 p-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              Clinic documents
            </CardTitle>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Doctors can ask the assistant about anything in these.
            </p>
          </CardHeader>

          {documents.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No documents yet"
              description="Add your policies, SOPs or fee schedule, and doctors can ask the assistant about them."
            />
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{doc.title}</span>
                      {!doc.answerable && <Badge variant="muted">Not in use</Badge>}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {doc.category ?? "Uncategorised"}
                      <span aria-hidden> · </span>
                      <span data-numeric>{doc.passages}</span>{" "}
                      {doc.passages === 1 ? "passage" : "passages"}
                    </p>
                  </div>
                  <RemoveKnowledgeDocumentButton documentId={doc.id} title={doc.title} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 p-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Recent activity</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {activity.counts.awaitingReview > 0
                ? `${activity.counts.awaitingReview} waiting for a doctor's review.`
                : "Nothing is waiting for review."}
            </p>
          </CardHeader>

          {activity.rows.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Nothing produced yet"
              description="Briefs, drafts and searches appear here as doctors use them."
            />
          ) : (
            <ul className="divide-y divide-border">
              {activity.rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">
                        {TYPE_LABEL[row.type] ?? row.type}
                      </span>
                      <StatusBadge status={row.status} />
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {row.userName}
                      {row.patientMrn && (
                        <>
                          <span aria-hidden> · </span>
                          <span data-numeric>{row.patientMrn}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <span className="shrink-0 text-[12px] text-muted-foreground tabular">
                    {row.createdAt.toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ACCEPTED") return <Badge variant="success">Accepted</Badge>;
  if (status === "REJECTED") return <Badge variant="muted">Dismissed</Badge>;
  if (status === "FAILED") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="ai">Awaiting review</Badge>;
}

function AISkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="mt-2 h-4 w-full max-w-96" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <Skeleton className="mb-5 h-16 rounded-xl" />
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </>
  );
}
