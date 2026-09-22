import type { Metadata } from "next";
import { UserCog } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Profile & Availability" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={UserCog}
      title={"Profile & Availability"}
      description={"Your clinical profile, working hours and how the queue should treat your time."}
      part={"Part 2"}
      capabilities={[
    "Profile, department and qualifications",
    "Working hours and recurring availability",
    "Break and block-out windows",
    "Consultation duration defaults",
    "Online and away status",
      ]}
    />
  );
}
