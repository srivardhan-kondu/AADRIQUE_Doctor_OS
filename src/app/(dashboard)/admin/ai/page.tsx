import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "AI Assistants" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Sparkles}
      title={"AI Assistants"}
      description={"Configure what the AI layer may do, and over which approved sources."}
      part={"Part 4"}
      capabilities={[
    "Assistant configuration per capability",
    "Approved hospital document sources",
    "Provider abstraction and model selection",
    "Safety rules and required-approval settings",
    "AI usage and acceptance reporting",
      ]}
    />
  );
}
