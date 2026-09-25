"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { AddOn } from "@/lib/add-ons";
import { workspaceFromPath } from "@/lib/nav";
import { noteNavigation } from "@/lib/nav-history";
import { sidebarStore } from "@/lib/sidebar-store";
import { Sidebar, type NavCounters } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { CopilotDock } from "@/components/shell/copilot-dock";
import type { ShellNotification } from "@/components/shell/notification-center";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";

/**
 * The application shell (spec §24).
 *
 * Owns everything that persists across routes: navigation, the header, the
 * command palette, the shortcut layer and the Copilot dock. Screens render
 * into `children` and never re-implement chrome.
 */
export function AppShell({
  children,
  counters,
  notifications = [],
  lockedAddOns = [],
}: {
  children: React.ReactNode;
  counters?: NavCounters;
  notifications?: ShellNotification[];
  lockedAddOns?: AddOn[];
}) {
  const pathname = usePathname();
  const workspace = workspaceFromPath(pathname);

  const collapsed = React.useSyncExternalStore(
    sidebarStore.subscribe,
    sidebarStore.getSnapshot,
    sidebarStore.getServerSnapshot,
  );

  React.useEffect(() => {
    noteNavigation();
  }, [pathname]);

  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [copilotOpen, setCopilotOpen] = React.useState(false);

  const openPalette = React.useCallback(() => setPaletteOpen(true), []);
  const showShortcuts = React.useCallback(() => setShortcutsOpen(true), []);
  const openMobileNav = React.useCallback(() => setMobileNavOpen(true), []);
  const toggleCopilot = React.useCallback(() => setCopilotOpen((v) => !v), []);
  const closeCopilot = React.useCallback(() => setCopilotOpen(false), []);

  useGlobalShortcuts({
    workspace,
    onOpenPalette: openPalette,
    onShowShortcuts: showShortcuts,
  });

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        workspace={workspace}
        collapsed={collapsed}
        onToggle={sidebarStore.toggle}
        counters={counters}
        lockedAddOns={lockedAddOns}
      />

      <MobileNav
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        workspace={workspace}
        counters={counters}
        lockedAddOns={lockedAddOns}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenPalette={openPalette}
          onOpenMobileNav={openMobileNav}
          onToggleCopilot={toggleCopilot}
          copilotOpen={copilotOpen}
          notifications={notifications}
        />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1">{children}</main>
          {copilotOpen && <CopilotDock onClose={closeCopilot} />}
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        workspace={workspace}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        workspace={workspace}
      />
    </div>
  );
}
