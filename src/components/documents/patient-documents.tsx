import { FileImage, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { DOCUMENT_KINDS, type PatientDocument, listDocuments } from "@/server/services/documents";
import { MarkReviewedButton, UploadDocumentDialog } from "./document-controls";

/**
 * Spec §7 — the patient's reports and documents. A lab result waits,
 * flagged, until a doctor marks it reviewed.
 */
export function PatientDocuments({
  patientId,
  documents,
  canUpload,
  canReview,
}: {
  patientId: string;
  documents: PatientDocument[];
  canUpload: boolean;
  canReview: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Reports & documents</CardTitle>
        {canUpload && <UploadDocumentDialog patientId={patientId} />}
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No reports yet. Upload lab results or documents the patient brings, so they sit with the record.
          </p>
        ) : (
          <ul className="space-y-3">
            {documents.map((d) => {
              const Icon = d.contentType === "application/pdf" ? FileText : FileImage;
              return (
                <li key={d.id} className="min-w-0">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/api/documents/${d.id}`}
                        target="_blank"
                        rel="noopener"
                        className="block truncate text-[13px] font-medium underline-offset-4 hover:underline"
                      >
                        {d.name}
                      </a>
                      <p className="text-[11px] text-muted-foreground">
                        {DOCUMENT_KINDS[d.kind]} ·{" "}
                        {d.uploadedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {d.uploadedBy && ` · ${d.uploadedBy}`} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
                      </p>
                      {d.lab?.summary && <p className="mt-0.5 text-[12px]">{d.lab.summary}</p>}
                      {d.lab && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {d.lab.abnormal && <Badge variant="destructive">Abnormal</Badge>}
                          {d.lab.status === "REVIEWED" ? (
                            <Badge variant="success">Reviewed</Badge>
                          ) : (
                            <>
                              <Badge variant="warning">Awaiting review</Badge>
                              {canReview && <MarkReviewedButton labReportId={d.lab.id} patientId={patientId} />}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** The panel as a page renders it: nothing for a viewer who cannot read lab results. */
export async function DocumentsPanel({ patientId }: { patientId: string }) {
  const actor = await requireActor();
  if (!hasPermission(actor, Permission.LAB_READ)) return null;
  const documents = await listDocuments(actor, patientId);
  return (
    <PatientDocuments
      patientId={patientId}
      documents={documents}
      canUpload={hasPermission(actor, Permission.LAB_UPLOAD)}
      canReview={hasPermission(actor, Permission.CONSULTATION_UPDATE)}
    />
  );
}
