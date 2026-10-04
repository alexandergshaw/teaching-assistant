"use client";

import InboxPanel from "./canvas-tab/inbox-panel";

// Inbox is surfaced as its own subtab under LMS Integration (the tab chrome
// and institution picker live in the parent). The Canvas announcement composer
// and the course-wide message panel moved to the Announcements sub-tab
// (ANNOUNCEMENTS-TAB wave A-W2); this file hosts the Inbox panel only.
export default function CanvasTab({ view }: { view: "inbox" }) {
  void view;
  return <InboxPanel />;
}
