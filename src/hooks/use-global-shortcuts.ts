"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { flatNav } from "@/lib/nav";
import type { Workspace } from "@/types";

/** True when focus is in a field, so shortcuts must not hijack the keystroke. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Spec §19 + §35 rule 8 — global keyboard layer.
 *
 * - Cmd/Ctrl+K opens the command palette.
 * - `g` then a section key jumps between screens (`g q` → queue).
 * - `?` opens the shortcut reference.
 *
 * The `g` prefix expires after 1.2s so a stray keypress never strands the user
 * in a pending chord.
 *
 * Both callbacks must be stable (wrap them in `useCallback`) — they are effect
 * dependencies, and unstable ones would rebind the listener on every render.
 */
export function useGlobalShortcuts({
  workspace,
  onOpenPalette,
  onShowShortcuts,
}: {
  workspace: Workspace;
  onOpenPalette: () => void;
  onShowShortcuts: () => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    const items = flatNav(workspace);
    let pendingG: number | null = null;

    function clearPending() {
      if (pendingG !== null) {
        window.clearTimeout(pendingG);
        pendingG = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        clearPending();
        onOpenPalette();
        return;
      }

      if (mod || e.altKey || isTypingTarget(e.target)) return;

      if (e.key === "?") {
        e.preventDefault();
        clearPending();
        onShowShortcuts();
        return;
      }

      const key = e.key.toLowerCase();

      if (pendingG !== null) {
        clearPending();
        const match = items.find((item) => item.shortcut === key);
        if (match) {
          e.preventDefault();
          router.push(match.href);
        }
        return;
      }

      if (key === "g") {
        pendingG = window.setTimeout(clearPending, 1200);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPending();
    };
  }, [router, workspace, onOpenPalette, onShowShortcuts]);
}
