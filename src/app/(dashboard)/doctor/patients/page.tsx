import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Patients" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={UsersRound}
      title={"Patients"}
      description={"Instant search across the patients you treat, by name, mobile number or patient ID."}
      part={"Part 2"}
      capabilities={[
    "Instant search by name, mobile, patient ID and appointment ID",
    "Recently seen patients",
    "Important clinical flags surfaced in results",
    "Direct entry into Patient 360",
    "Registration for a patient who is not yet on file",
      ]}
    />
  );
}
