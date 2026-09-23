import type { Metadata } from "next";
import { Suspense } from "react";
import {
  BookOpen,
  CircleCheck,
  CircleSlash,
  Clock3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listAIActivity } from "@/server/services/ai";
import { prisma } from "@/lib/db";

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
  VOICE_TO_NOTE: "Voice to note",
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
        what="to manage AI settings"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const [activity, documents] = await Promise.all([
    listAIActivity(actor, 60),
    prisma.hospitalDocument.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        approved: true,
        status: true,
        updatedAt: true,
        _count: { select: { chunks: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="AI"
        description="Every AI output, what it was built from, and what the doctor decided about it."
      />

      {/* Spec §10 — the safety posture, stated on the screen that governs it. */}
      <div
        className={cn(
          "mb-5 flex flex-wrap items-start gap-3 rounded-xl px-4 py-3",
          activity.modelConfigured
            ? "ai-surface"
            : "border border-border bg-card",
        )}
      >
        <ShieldCheck
          className={cn(
            "mt-0.5 size-4 shrink-0",
            activity.modelConfigured ? "text-ai" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">
            {activity.modelConfigured
              ? "A model is configured for this organization."
              : "No model is configured."}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {activity.modelConfigured
              ? "Claude writes each answer from records retrieved first, and every citation is checked against those records before a doctor sees it."
              : "Answers are assembled deterministically from the patient's own records. Nothing is generated, so nothing can be invented. Set ANTHROPIC_API_KEY to enable the model."}{" "}
            Either way, AI never diagnoses, never writes to a clinical record,
            and never sends anything to a patient without a doctor accepting it.
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Outputs generated" value={activity.counts.total} icon={Sparkles} />
        <Stat
          label="Awaiting review"
          value={activity.counts.awaitingReview}
          icon={Clock3}
          tone={activity.counts.awaitingReview > 0 ? "warn" : undefined}
        />
        <Stat label="Accepted" value={activity.counts.accepted} icon={CircleCheck} tone="good" />
        <Stat label="Dismissed" value={activity.counts.rejected} icon={CircleSlash} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Activity</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Newest first. Every row is also in the audit log.
            </p>
          </CardHeader>

          {activity.rows.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Nothing generated yet"
              description="Briefs, drafts and searches will appear here as doctors use them."
            />
          ) : (
            <ul className="divide-y divide-border">
              {activity.rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold">
                        {TYPE_LABEL[row.type] ?? row.type}
                      </span>
                      <StatusBadge status={row.status} />
                      {row.grounded && <Badge variant="muted">From records</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {row.summaryLine}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.userName}
                      {row.patientMrn && (
                        <>
                          <span aria-hidden> · </span>
                          <span data-numeric>{row.patientMrn}</span>
                        </>
                      )}
                      <span aria-hidden> · </span>
                      <span data-numeric>{row.sourceCount}</span>{" "}
                      {row.sourceCount === 1 ? "source" : "sources"}
                      {row.latencyMs !== null && (
                        <>
                          <span aria-hidden> · </span>
                          <span data-numeric>{row.latencyMs}ms</span>
                        </>
                      )}
                    </p>
                  </div>

                  <span className="shrink-0 text-[11px] text-muted-foreground tabular">
                    {row.createdAt.toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              Knowledge base
            </CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Only approved, indexed documents can be quoted in an answer.
            </p>
          </CardHeader>

          {documents.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No documents yet"
              description="SOPs, policies and guidelines uploaded here become answerable by the knowledge assistant."
            />
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <li key={doc.id} className="px-5 py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold">{doc.title}</span>
                    {doc.approved && doc.status === "INDEXED" ? (
                      <Badge variant="success">Answerable</Badge>
                    ) : (
                      <Badge variant="muted">
                        {doc.approved ? doc.status.toLowerCase() : "not approved"}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {doc.category ?? "Uncategorised"}
                    <span aria-hidden> · </span>
                    <span data-numeric>{doc._count.chunks}</span> passages
                  </p>
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

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Sparkles;
  tone?: "good" | "warn";
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-bold tabular",
          tone === "warn" && value > 0 && "text-warning",
          tone === "good" && value > 0 && "text-success",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function AISkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-4 w-full max-w-96" />
      </div>
      <Skeleton className="mb-5 h-20 rounded-xl" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </>
  );
}
