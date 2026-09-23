import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Organisation Overview" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={LayoutDashboard}
      title={"Organisation Overview"}
      description={"Operations across the facility — volume, utilisation and where the day is slipping."}
      part={"Part 5"}
      capabilities={[
    "Total OPD volume and department volume",
    "Doctor utilisation",
    "Peak hours and average wait",
    "Appointment conversion, cancellation and no-show rates",
    "Communication delivery rate",
    "Operational insight when a bottleneck appears",
      ]}
    />
  );
}
