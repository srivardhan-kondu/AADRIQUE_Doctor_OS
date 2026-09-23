import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Bell}
      title={"Notifications"}
      description={"Every message the front desk has sent, and what happened to it."}
      part={"Part 5"}
      capabilities={[
    "Appointment and token notifications",
    "Delivery status per channel",
    "Manual resend for failed messages",
    "Template selection",
    "Bulk notification for schedule changes",
      ]}
    />
  );
}
