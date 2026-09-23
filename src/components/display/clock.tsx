"use client";

import * as React from "react";

/** The waiting-room clock. Rendered after mount so server and client agree. */
export function Clock({ className }: { className?: string }) {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className={className} suppressHydrationWarning>
      {now?.toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }) ?? " "}
    </span>
  );
}
