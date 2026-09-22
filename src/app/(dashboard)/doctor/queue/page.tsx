import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "My Queue" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Users}
      title={"My Queue"}
      description={"Token and queue management as a first-class workflow, not a table of rows."}
      part={"Part 2"}
      capabilities={[
    "Token generation and ordering",
    "Priority queue handling",
    "Call Next, Start, Pause and Complete actions",
    "Estimated wait time per token",
    "Counter and room assignment",
    "Automatic patient notification on token changes",
      ]}
    />
  );
}
