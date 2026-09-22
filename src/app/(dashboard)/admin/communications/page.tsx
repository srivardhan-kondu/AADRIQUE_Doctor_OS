import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Communications" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={MessageSquare}
      title={"Communications"}
      description={"Templates, campaigns and the automation workflows behind them."}
      part={"Part 3"}
      capabilities={[
    "Editable message templates per channel",
    "Transactional and engagement message types",
    "Feedback and review automation workflow",
    "Campaign scheduling",
    "Workflow builder: trigger, wait, condition, action",
    "Delivery and failure reporting",
      ]}
    />
  );
}
