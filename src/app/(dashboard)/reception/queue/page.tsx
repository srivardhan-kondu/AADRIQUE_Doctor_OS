import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Today's Queue" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Users}
      title={"Today's Queue"}
      description={"The live OPD queue across every doctor on duty."}
      part={"Part 2"}
      capabilities={[
    "Queue per doctor with current and next token",
    "Priority and re-ordering controls",
    "Counter and room assignment",
    "Pause and resume a queue",
    "Patient-facing token display",
      ]}
    />
  );
}
