import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Audit Log" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={ClipboardList}
      title={"Audit Log"}
      description={"Who did what, to which record, and when."}
      part={"Part 3"}
      capabilities={[
    "Login and logout events",
    "Record create, update and view events",
    "Prescription created and consultation signed",
    "AI output generated and accepted",
    "Message sent and integration changed",
    "Permission changes",
      ]}
    />
  );
}
