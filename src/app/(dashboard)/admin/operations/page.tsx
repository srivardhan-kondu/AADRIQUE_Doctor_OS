import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Operations" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Activity}
      title={"Operations"}
      description={"Live operational state across every queue and doctor."}
      part={"Part 3"}
      capabilities={[
    "Live queue depth per department",
    "Wait time trend over the last hours",
    "Bottleneck detection with a measurable cause",
    "Doctor availability and pauses",
    "Configurable operational thresholds",
      ]}
    />
  );
}
