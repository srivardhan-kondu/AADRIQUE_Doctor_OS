"use client";

import {
  FileText,
  History,
  MessageSquareQuote,
  Search,
  Sparkles,
  Stethoscope,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Spec §6 + §9 — the AI Copilot dock.
 *
 * The panel is part of the shell so it keeps its context as the doctor moves
 * between screens. Every action here is a *drafting* action: the Copilot
 * summarises, retrieves and prepares, and a doctor approves anything that
 * reaches the clinical record (spec §10).
 *
 * The dock is the way in, not the workspace. Each action opens the Copilot
 * screen, where the answer arrives with the records it was built from — a
 * 340px rail is the wrong place to read a cited brief.
 */

interface CopilotAction {
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

const ACTIONS: CopilotAction[] = [
  {
    label: "Summarize history",
    href: "/doctor/copilot",
    description: "Condense this patient's recorded visits into a short read.",
    icon: History,
  },
  {
    label: "Pre-consultation brief",
    href: "/doctor/queue",
    description: "Ready on every open consultation, with its sources attached.",
    icon: Stethoscope,
  },
  {
    label: "Draft consultation note",
    href: "/doctor/queue",
    description: "Dictate, and have it laid out under clinical headings.",
    icon: FileText,
  },
  {
    label: "Prepare follow-up message",
    href: "/doctor/follow-ups",
    description: "Write a patient-friendly message for your approval.",
    icon: MessageSquareQuote,
  },
  {
    label: "Find in history",
    href: "/doctor/copilot",
    description: "Ask in plain language — “last migraine-related visit”.",
    icon: Search,
  },
  {
    label: "Show missing documentation",
    href: "/doctor/queue",
    description: "See what this note is missing before you sign it.",
    icon: TriangleAlert,
  },
];

export function CopilotDock({ onClose }: { onClose: () => void }) {
  return (
    <aside
      aria-label="AI Copilot"
      className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-card xl:flex"
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <span className="flex size-7 items-center justify-center rounded-lg bg-ai-soft">
          <Sparkles className="size-4 text-ai" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-none">AI Copilot</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Drafts and summaries you review
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close AI Copilot">
          <X />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Spec §10 — the safety contract is stated in the UI, not buried. */}
          <div className="ai-surface rounded-xl p-3">
            <Badge variant="ai" className="mb-2">
              <Sparkles />
              AI generated
            </Badge>
            <p className="text-[12px] leading-relaxed text-foreground/80">
              The Copilot summarizes, drafts and retrieves from this patient&apos;s
              recorded data. It never diagnoses, never edits a signed record and
              never sends a message on its own. Everything it produces is marked
              and waits for your approval.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Actions
            </p>
            <ul className="space-y-1.5">
              {ACTIONS.map((action) => (
                <li key={action.label}>
                  <Link
                    href={action.href}
                    onClick={onClose}
                    className="flex w-full items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-ai-border hover:bg-ai-soft/40"
                  >
                    <action.icon className="mt-0.5 size-4 shrink-0 text-ai" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium leading-none">
                        {action.label}
                      </span>
                      <span className="mt-1.5 block text-[12px] leading-snug text-muted-foreground">
                        {action.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-lg bg-muted px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            A brief and the note copilot live inside the consultation itself.
            Open a patient from your queue to use them there.
          </p>
        </div>
      </ScrollArea>
    </aside>
  );
}
