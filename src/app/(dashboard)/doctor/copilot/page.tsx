import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "AI Copilot" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Sparkles}
      title={"AI Copilot"}
      description={"Summaries, drafts and retrieval across this patient's recorded data — always for your review."}
      part={"Part 4"}
      capabilities={[
    "Patient summary from recorded visits",
    "Pre-consultation brief with source citations",
    "Consultation note drafting from structured or dictated input",
    "Voice to structured note",
    "Natural-language history search",
    "Hospital knowledge assistant over approved documents",
      ]}
    />
  );
}
