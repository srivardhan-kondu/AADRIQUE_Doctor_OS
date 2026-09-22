"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarPlus,
  MessageSquarePlus,
  Moon,
  PlayCircle,
  Search,
  Stethoscope,
  Sun,
  UserPlus,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { flatNav, WORKSPACE_META } from "@/lib/nav";
import { useSession } from "@/lib/session";
import type { Workspace } from "@/types";

/**
 * Spec §19 + §41-H — the command palette.
 *
 * This is a signature interaction, so it is part of the shell rather than any
 * one screen: it is reachable from every route. Part 2 adds live patient search
 * results (spec §41-I) behind the same input; the groups below are the static
 * spine those results slot into.
 */
export function CommandPalette({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const user = useSession();
  const navItems = React.useMemo(() => flatNav(workspace), [workspace]);

  const run = React.useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      // Let the dialog close before navigating so the exit animation plays.
      requestAnimationFrame(fn);
    },
    [onOpenChange],
  );

  /** Actions that need data land in Part 2; until then they say so honestly. */
  const pending = (feature: string) =>
    toast(`${feature} arrives in the next build part`, {
      description: "The shell route is wired — the workflow lands with the data layer.",
    });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={`Search patients, screens and actions…`}
        autoFocus
      />
      <CommandList>
        <CommandEmpty>
          <p className="font-medium text-foreground">No matches</p>
          <p className="mt-1 text-[13px]">
            Try a patient name, a mobile number or a patient ID.
          </p>
        </CommandEmpty>

        <CommandGroup heading="Quick actions">
          <CommandItem
            onSelect={() => run(() => pending("Next patient"))}
            keywords={["next", "consultation", "start", "call"]}
          >
            <PlayCircle className="text-accent" />
            <span>Open next consultation</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => pending("Patient registration"))}
            keywords={["register", "add", "new patient"]}
          >
            <UserPlus className="text-muted-foreground" />
            <span>New patient</span>
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => pending("Appointment booking"))}
            keywords={["book", "schedule", "slot"]}
          >
            <CalendarPlus className="text-muted-foreground" />
            <span>New appointment</span>
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => pending("Message composer"))}
            keywords={["whatsapp", "sms", "email", "send"]}
          >
            <MessageSquarePlus className="text-muted-foreground" />
            <span>Send message</span>
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => router.push(`/${workspace}/patients`))}
            keywords={["find", "lookup", "mobile", "patient id"]}
          >
            <Search className="text-muted-foreground" />
            <span>Search patients</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Go to">
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              onSelect={() => run(() => router.push(item.href))}
              keywords={[item.label]}
            >
              <item.icon className="text-muted-foreground" />
              <span>{item.label}</span>
              {item.shortcut && (
                <CommandShortcut>G then {item.shortcut}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Workspace">
          {(Object.keys(WORKSPACE_META) as Workspace[])
            .filter((w) => w !== workspace)
            .map((w) => {
              const meta = WORKSPACE_META[w];
              return (
                <CommandItem
                  key={w}
                  onSelect={() => run(() => router.push(meta.href))}
                  keywords={[meta.label, meta.description]}
                >
                  <meta.icon className="text-muted-foreground" />
                  <span>Switch to {meta.label}</span>
                  <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
                </CommandItem>
              );
            })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() =>
              run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))
            }
            keywords={["theme", "dark mode", "light mode", "appearance"]}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="text-muted-foreground" />
            ) : (
              <Moon className="text-muted-foreground" />
            )}
            <span>
              Switch to {resolvedTheme === "dark" ? "light" : "dark"} appearance
            </span>
          </CommandItem>
          <CommandItem disabled>
            <Stethoscope className="text-muted-foreground" />
            <span>
              Signed in as {user.name}
              {user.department ? ` · ${user.department}` : ""}
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
