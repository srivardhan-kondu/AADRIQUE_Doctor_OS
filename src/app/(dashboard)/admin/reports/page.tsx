import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={BarChart3}
      title={"Reports"}
      description={"Scheduled and ad-hoc reporting over operational data."}
      part={"Part 3"}
      capabilities={[
    "OPD volume and utilisation reports",
    "Communication delivery reporting",
    "Follow-up completion reporting",
    "Feedback and review reporting",
    "Scheduled report delivery",
      ]}
    />
  );
}
