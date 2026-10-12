// Shared leaf for rendering a tab as a real anchor (tabs-ctrl-click scope,
// docs/tabs-ctrl-click-new-browser-tab-scope.md section 6a).
//
// A tab that is an <a href> lets the browser open it in a new tab on
// ctrl/cmd/shift/middle click, while a plain left click keeps the in-app
// client-state switch. Kept as a plain .ts leaf with no React dependency so the
// guard and the href builder are unit-testable (no component renders under
// vitest here).

import { buildUrlSearch, type UrlNavState } from "../../url-state";

/** The fields of a click event the guard reads. React's MouseEvent and the DOM
 *  MouseEvent both satisfy it. */
export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/**
 * True only for an unmodified primary click that should become an in-app tab
 * switch. Every other case (ctrl/cmd/shift/alt held, a non-primary button, an
 * event something already handled) falls through so the browser opens the href
 * natively. A middle click does not fire onClick at all, so the case this guard
 * really exists for is a modified LEFT click.
 */
export function isPlainLeftClick(e: ClickLike): boolean {
  return (
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}

/**
 * The absolute-path deep link for a tab: the canonical query string
 * buildUrlSearch already produces (it always carries `tab=`, so a cold load
 * takes the URL-wins branch in useAppNavigation), prefixed with "/" so a new
 * browser tab resolves it against the site root.
 */
export function buildTabHref(navState: UrlNavState, patch: Partial<UrlNavState>): string {
  return "/" + buildUrlSearch({ ...navState, ...patch });
}
