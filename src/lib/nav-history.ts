/**
 * Whether this tab has moved between screens of the app since it loaded.
 *
 * `document.referrer` does not change on client-side navigation and
 * `history.length` counts pages from other sites, so neither can say whether
 * "back" stays inside the app. The shell counts route changes instead.
 */
let navigations = 0;

export function noteNavigation(): void {
  navigations += 1;
}

export function canGoBackInApp(): boolean {
  // The first route the shell sees is the page the tab opened on.
  return navigations > 1;
}
