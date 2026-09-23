"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A dialog's open state, which the URL can also ask for: `?open=<param>`.
 *
 * Lets the command palette (spec §19) open "register a patient" or "book an
 * appointment" on whichever screen owns it — including the one already on
 * screen, since a change to the URL re-renders the dialog with it open.
 * Closing the dialog removes the flag, so a reload does not reopen it.
 *
 * Give `openParam` to one dialog per page — the header's — not to every
 * instance in a list.
 */
export function useDialogState(openParam?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openHere, setOpenHere] = React.useState(false);

  const fromUrl =
    openParam !== undefined && searchParams.get("open") === openParam;

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenHere(next);
      if (!next && fromUrl) {
        const params = new URLSearchParams(searchParams);
        params.delete("open");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [fromUrl, pathname, router, searchParams],
  );

  return [openHere || fromUrl, setOpen] as const;
}
