import type { Metadata } from "next";
import { Repeat2 } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Follow-ups" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Repeat2}
      title={"Follow-ups"}
      description={"Every patient who owes you a return visit, sorted by what is overdue."}
      part={"Part 3"}
      capabilities={[
    "Overdue, due today and upcoming grouping",
    "Follow-up creation from a completed consultation",
    "Patient reactivation for missed follow-ups",
    "One-tap follow-up message drafting",
    "Completion tracking",
      ]}
    />
  );
}
