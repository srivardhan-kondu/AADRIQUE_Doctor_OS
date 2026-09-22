import type { Metadata } from "next";
import { Blocks } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Integrations" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Blocks}
      title={"Integrations"}
      description={"HMS, EMR, lab, pharmacy and communication providers, each behind an adapter."}
      part={"Part 5"}
      capabilities={[
    "WhatsApp, SMS and email providers",
    "Lab and pharmacy systems",
    "HMS and EMR connectors",
    "Connection status: connected, needs attention, disconnected, not configured",
    "Health checks and sync history",
      ]}
    />
  );
}
