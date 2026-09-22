import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Doctor Command Center" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={LayoutDashboard}
      title={"Doctor Command Center"}
      description={"Your day at a glance — live queue, today's schedule and the patient flow across the OPD."}
      part={"Part 2"}
      capabilities={[
    "Live metrics: patients today, waiting, in consultation, completed, follow-ups due",
    "Live Queue with token, patient, status and wait time",
    "Today's Schedule with appointments, walk-ins and breaks",
    "Patient Flow visualisation across the six OPD stages",
    "Doctor Daily Brief with a Start My Day action",
    "One-click entry into the next active consultation",
      ]}
    />
  );
}
