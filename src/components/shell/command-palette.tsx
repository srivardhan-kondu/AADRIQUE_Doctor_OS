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
  Ticket,
  UserPlus,
  UserRound,
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
import {
  searchPatientsAction,
  type PatientChoice,
} from "@/app/(dashboard)/doctor/appointments/actions";
import { callNextAction } from "@/app/(dashboard)/doctor/queue/actions";

/**
 * Spec §19 + §41-H — the command palette.
 *
 * This is a signature interaction, so it is part of the shell rather than any
 * one screen: it is reachable from every route. Typing searches patients as
 * well as screens (spec §41-I); the quick actions are the ones this
 * workspace actually has, and each does the real thing.
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

  // Spec §41-I — universal patient search, in the palette. Debounced, and a
  // slower earlier answer never replaces a newer one.
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<{ query: string; rows: PatientChoice[] }>({
    query: "",
    rows: [],
  });
  const [searching, startSearch] = React.useTransition();
  const term = query.trim();

  React.useEffect(() => {
    if (term.length < 2) return;
    let stale = false;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const rows = await searchPatientsAction(term);
        if (!stale) setFound({ query: term, rows });
      });
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [term]);

  const patients = term.length >= 2 && found.query === term ? found.rows : [];
  const patientBase = `/${workspace}/patients`;

  /** Spec §41-B — the next patient, one keystroke from anywhere. */
  const callNext = () =>
    run(async () => {
      const result = await callNextAction();
      if (!result.ok) {
        toast.error(result.message ?? "Could not call the next patient.", {
          description: result.action,
        });
        return;
      }
      toast.success(result.message ?? "Called.");
      if (result.redirectTo) router.push(result.redirectTo);
      else router.refresh();
    });

  const go = (href: string) => run(() => router.push(href));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={`Search patients, screens and actions…`}
        autoFocus
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          <p className="font-medium text-foreground">
            {searching ? "Searching…" : "No matches"}
          </p>
          <p className="mt-1 text-[13px]">
            Try a patient name, a mobile number or a patient ID.
          </p>
        </CommandEmpty>

        {patients.length > 0 && (
          <>
            <CommandGroup heading="Patients">
              {patients.map((patient) => (
                <CommandItem
                  key={patient.id}
                  // The server already matched these; the query is in the
                  // keywords so the palette's own filter keeps them.
                  value={`patient-${patient.id}`}
                  keywords={[term, patient.name, patient.mrn, patient.phone]}
                  onSelect={() => go(`${patientBase}/${patient.id}`)}
                >
                  <UserRound className="text-muted-foreground" />
                  <span className="truncate">{patient.name}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {patient.mrn}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Quick actions">
          {workspace === "doctor" && user.doctorId && (
            <CommandItem
              onSelect={callNext}
              keywords={["next", "consultation", "start", "call"]}
            >
              <PlayCircle className="text-accent" />
              <span>Call next patient</span>
            </CommandItem>
          )}
          {workspace === "reception" && (
            <CommandItem
              onSelect={() => go("/reception?open=walk-in")}
              keywords={["token", "walk in", "queue", "add"]}
            >
              <Ticket className="text-accent" />
              <span>Walk-in token</span>
            </CommandItem>
          )}
          <CommandItem
            onSelect={() =>
              go(
                workspace === "reception"
                  ? "/reception?open=register"
                  : `${patientBase}?open=register`,
              )
            }
            keywords={["register", "add", "new patient"]}
          >
            <UserPlus className="text-muted-foreground" />
            <span>Register a patient</span>
          </CommandItem>
          {workspace !== "admin" && (
            <CommandItem
              onSelect={() =>
                go(
                  workspace === "reception"
                    ? "/reception?open=book"
                    : "/doctor/appointments?open=book",
                )
              }
              keywords={["book", "schedule", "slot", "appointment"]}
            >
              <CalendarPlus className="text-muted-foreground" />
              <span>Book an appointment</span>
            </CommandItem>
          )}
          {workspace === "doctor" && (
            <CommandItem
              onSelect={() => go("/doctor/messages")}
              keywords={["whatsapp", "sms", "email", "send", "message"]}
            >
              <MessageSquarePlus className="text-muted-foreground" />
              <span>Send a message</span>
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => go(patientBase)}
            keywords={["find", "lookup", "mobile", "patient id"]}
          >
            <Search className="text-muted-foreground" />
            <span>All patients</span>
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
