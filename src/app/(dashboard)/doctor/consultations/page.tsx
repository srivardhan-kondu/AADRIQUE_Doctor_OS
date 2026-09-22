import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Consultations" };

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Stethoscope}
      title={"Consultations"}
      description={"The three-panel consultation workspace — the most important screen in the product."}
      part={"Part 2"}
      capabilities={[
    "Patient Snapshot panel with allergies, flags and chronic conditions",
    "Chief complaint, symptoms, notes, assessment and plan",
    "Vitals, medications, orders and history tabs",
    "Automatic draft persistence across refreshes",
    "Sign-off that moves a consultation from draft to signed",
    "Contextual AI Copilot alongside, never in control",
      ]}
    />
  );
}
