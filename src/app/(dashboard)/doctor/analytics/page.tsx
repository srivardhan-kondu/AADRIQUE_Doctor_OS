import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={BarChart3}
      title={"Analytics"}
      description={"Your own OPD performance, kept to what is worth acting on."}
      part={"Part 3"}
      capabilities={[
    "Patients per day with a single primary trend",
    "Average consultation time and average wait time",
    "Completion, follow-up and no-show rates",
    "Repeat visit rate",
    "Patient feedback summary",
      ]}
    />
  );
}
