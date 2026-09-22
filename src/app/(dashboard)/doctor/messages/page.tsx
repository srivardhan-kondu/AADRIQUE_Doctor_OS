import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={MessageSquare}
      title={"Messages"}
      description={"One unified inbox across WhatsApp, SMS and email."}
      part={"Part 3"}
      capabilities={[
    "Unified conversation view per patient",
    "Delivery status: delivered, read, pending, failed",
    "Template-driven transactional messages",
    "Follow-up and feedback automation",
    "Retry handling with a clear next step on failure",
      ]}
    />
  );
}
