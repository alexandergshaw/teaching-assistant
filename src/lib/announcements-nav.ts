// "Jump to the Announcements tab" - the cross-link in the Recording tab's
// record-announcement surface (ANNOUNCEMENTS-TAB wave A-W2) needs to land the
// instructor on Tools > Announcements > Post an announcement. manualView and
// announcementsView are held in page.tsx's own state (useAppNavigation.ts), so
// a descendant dispatches a live-listener event instead of reaching the
// setters, exactly like drafts-nav.ts (openMessageDrafts) does.
//
// A LEAF module: no React import, nothing server-only. The event carries no
// payload; every dispatch wants the same destination, which page.tsx's
// listener applies (setManualView("announcements") + the "post" inner view).

/** The event name, so nobody re-types the string literal. */
export const ANNOUNCEMENTS_NAV_EVENT = "ta-announcements-nav";

/** Request a jump to Tools > Announcements (the "post" inner view). No-ops
 * outside a browser (SSR). */
export function openAnnouncementsTab(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENTS_NAV_EVENT));
}
