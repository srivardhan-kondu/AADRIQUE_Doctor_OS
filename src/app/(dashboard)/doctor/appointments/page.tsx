import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Appointments" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={CalendarDays}
      title={"Appointments"}
      description={"Your schedule, recurring availability and the full appointment lifecycle."}
      part={"Part 2"}
      capabilities={[
    "Doctor schedule with day and week views",
    "Appointment types and durations",
    "Reschedule and cancellation flows",
    "Recurring availability rules",
    "No-show tracking",
    "Waitlist management",
      ]}
    />
  );
}
