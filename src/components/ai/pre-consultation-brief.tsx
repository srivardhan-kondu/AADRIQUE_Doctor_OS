import { Suspense } from "react";
import { requireActor } from "@/server/context";
import { getOrCreatePreConsultationBrief } from "@/server/services/ai";
import { AIOutputSkeleton, AIOutputView } from "./ai-output";

/**
 * Spec §8 — the pre-consultation brief.
 *
 * Streamed in its own Suspense boundary so the consultation workspace paints
 * immediately and the brief arrives beside it. The doctor is never waiting on
 * the assistant to reach the note — which is the whole point of a product
 * where AI assists rather than gates.
 */
export function PreConsultationBrief({ visitId }: { visitId: string }) {
  return (
    <Suspense fallback={<AIOutputSkeleton lines={4} />}>
      <BriefPanel visitId={visitId} />
    </Suspense>
  );
}

async function BriefPanel({ visitId }: { visitId: string }) {
  const actor = await requireActor();
  const brief = await getOrCreatePreConsultationBrief(actor, visitId);

  // No brief is a quiet absence: the actor may not hold AI_USE, or there may
  // be nothing on record worth briefing. Neither is worth an error panel.
  if (!brief || brief.sections.length === 0) return null;

  return (
    <AIOutputView
      sections={brief.sections}
      sources={brief.sources}
      grounded={brief.grounded}
      note={brief.note}
      provider={brief.provider}
      model={brief.model}
      compact
    />
  );
}
