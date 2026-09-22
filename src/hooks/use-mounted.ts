"use client";

import * as React from "react";

const subscribe = () => () => {};

/**
 * True once the component is running in the browser.
 *
 * Used to defer values the server cannot know — the viewer's clock, timezone
 * and resolved theme — past hydration. Implemented with `useSyncExternalStore`
 * rather than an effect so there is no cascading render on mount.
 */
export function useMounted(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
