import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Settings}
      title={"Settings"}
      description={"Organisation, facility, roles and platform configuration."}
      part={"Part 5"}
      capabilities={[
    "Organisation and facility details",
    "Roles and granular permissions",
    "Queue and wait-time thresholds",
    "Working hours and holidays",
    "Security policy including MFA for administrators",
      ]}
    />
  );
}
