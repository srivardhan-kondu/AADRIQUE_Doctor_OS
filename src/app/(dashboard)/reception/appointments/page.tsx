import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Appointments" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={CalendarDays}
      title={"Appointments"}
      description={"Booking, rescheduling and cancellation across all doctors."}
      part={"Part 2"}
      capabilities={[
    "Booking against live doctor availability",
    "Reschedule and cancellation with patient notification",
    "Appointment status across the full lifecycle",
    "Waitlist handling",
    "Smart slot suggestions that never book without confirmation",
      ]}
    />
  );
}
