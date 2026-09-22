import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Front Desk" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={LayoutDashboard}
      title={"Front Desk"}
      description={"A high-speed interface for registration, search and booking."}
      part={"Part 2"}
      capabilities={[
    "Fast patient registration with only the fields that matter",
    "Instant patient search",
    "Walk-in token generation",
    "Today's arrivals and check-ins",
    "Doctor availability at a glance",
      ]}
    />
  );
}
