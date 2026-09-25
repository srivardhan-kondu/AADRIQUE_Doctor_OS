"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canGoBackInApp } from "@/lib/nav-history";

/**
 * Back to wherever the user came from — the queue, the consultations list,
 * a patient's record — rather than one fixed screen.
 *
 * Browser history is only used when the previous page was in this app;
 * opened from a bookmark or a new tab, it goes to `fallbackHref` instead of
 * leaving.
 */
export function BackButton({
  fallbackHref,
  label,
}: {
  fallbackHref: string;
  label: string;
}) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() => {
        if (canGoBackInApp()) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft />
    </Button>
  );
}
