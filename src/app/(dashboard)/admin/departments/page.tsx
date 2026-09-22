import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Departments" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Building2}
      title={"Departments"}
      description={"The departments patients are booked into and doctors belong to."}
      part={"Part 5"}
      capabilities={[
    "Create and edit departments",
    "Assign doctors",
    "Department-level queue thresholds",
    "Room and counter allocation",
    "Department volume reporting",
      ]}
    />
  );
}
