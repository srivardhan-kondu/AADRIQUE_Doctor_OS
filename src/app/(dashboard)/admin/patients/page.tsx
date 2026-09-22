import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Patients" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={UsersRound}
      title={"Patients"}
      description={"The facility-wide patient directory, under tenant boundaries."}
      part={"Part 2"}
      capabilities={[
    "Directory search and filtering",
    "Patient identifiers and merge handling",
    "Record access under role permissions",
    "Export under audited access",
      ]}
    />
  );
}
