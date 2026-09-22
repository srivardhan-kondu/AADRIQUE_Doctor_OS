import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Doctors" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Stethoscope}
      title={"Doctors"}
      description={"Configure the doctors who work in this facility."}
      part={"Part 5"}
      capabilities={[
    "Create and deactivate doctor accounts",
    "Assign departments",
    "Configure schedules and consultation durations",
    "Role and permission assignment",
    "Per-doctor queue configuration",
      ]}
    />
  );
}
