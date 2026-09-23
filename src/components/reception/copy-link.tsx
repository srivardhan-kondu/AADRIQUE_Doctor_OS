"use client";

import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Copies a patient's token-page link, for the desk to text or show them.
 * The path is signed by the server; this only makes it absolute.
 */
export function CopyTokenLink({ path, token }: { path: string; token: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Copy the live token link for ${token}`}
      title="Copy the patient's live token link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          toast.success(`Link for ${token} copied.`, {
            description: "The patient can follow their place in the queue on their phone.",
          });
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Could not copy the link.");
        }
      }}
    >
      {copied ? <Check /> : <Link2 />}
    </Button>
  );
}
