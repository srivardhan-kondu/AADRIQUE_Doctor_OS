"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-overlay",
              description: "!text-muted-foreground",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
