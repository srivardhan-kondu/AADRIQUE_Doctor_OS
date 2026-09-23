"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders a public page on an interval while it is visible.
 *
 * For pages with no session — a patient's token link — which cannot use the
 * authenticated live signal. The page itself is cheap and shows token
 * numbers only.
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        React.startTransition(() => router.refresh());
      }
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);

  return null;
}
