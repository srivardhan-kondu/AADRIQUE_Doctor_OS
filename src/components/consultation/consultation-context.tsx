"use client";

import * as React from "react";
import type { Favourites } from "@/server/services/favourites";

/**
 * What the parts of the consultation workspace tell each other.
 *
 * Signing lives with the note, but it issues the prescription too, so before
 * it signs it asks every editor that saves on a debounce to save now
 * (`registerFlush`) — signing must never issue a prescription without its last
 * line. The prescription reports what it holds (`reportRx`) so the sign
 * dialog can say what is about to be issued. The doctor's saved phrases and
 * sets are shared state because both the note and the prescription use them.
 */

export interface RxSummary {
  /** Medicines with a name — what would be issued. */
  count: number;
  /** Recorded allergies those medicines match. */
  warnings: string[];
}

interface ConsultationContextValue {
  reportRx: (summary: RxSummary) => void;
  registerFlush: (flush: () => Promise<boolean>) => () => void;
  favourites: Favourites;
  setFavourites: (next: Favourites) => void;
}

const ConsultationContext = React.createContext<ConsultationContextValue | null>(null);

export const ConsultationContextProvider = ConsultationContext.Provider;

export function useConsultation(): ConsultationContextValue {
  const value = React.useContext(ConsultationContext);
  if (!value) throw new Error("useConsultation must be used inside the consultation editor.");
  return value;
}
