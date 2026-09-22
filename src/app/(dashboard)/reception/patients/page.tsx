import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Patients" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={UsersRound}
      title={"Patients"}
      description={"Register, find and maintain the patient directory."}
      part={"Part 2"}
      capabilities={[
    "Registration with patient ID generation",
    "Search by name, mobile, patient ID and appointment ID",
    "Duplicate detection before creating a record",
    "Contact and emergency contact maintenance",
    "Quick booking from a search result",
      ]}
    />
  );
}
