"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { flatNav } from "@/lib/nav";
import type { Workspace } from "@/types";

/** Spec §51 — the shortcut layer has to be discoverable to be accessible. */
export function ShortcutsDialog({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
}) {
  const navShortcuts = flatNav(workspace).filter((i) => i.shortcut);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            The high-frequency actions are reachable without a mouse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Group title="Global">
            <Row keys={["⌘", "K"]} label="Open command palette" />
            <Row keys={["?"]} label="Show this reference" />
            <Row keys={["Esc"]} label="Close the open overlay" />
          </Group>

          <Group title="Go to">
            {navShortcuts.map((item) => (
              <Row
                key={item.href}
                keys={["G", item.shortcut!.toUpperCase()]}
                label={item.label}
              />
            ))}
          </Group>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-medium text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-md py-1">
      <span className="text-[13px]">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-[10px] text-muted-foreground">then</span>
            )}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </span>
    </li>
  );
}
