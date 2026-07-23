"use client";

import AnnouncementsPanel from "./canvas-tab/announcements-panel";
import InboxPanel from "./canvas-tab/inbox-panel";

type CanvasView = "announcements" | "inbox";

// Announcements and Inbox are surfaced as their own subtabs under LMS
// Integration, so this renders a single panel chosen by `view` (the tab chrome
// and institution picker live in the parent).
export default function CanvasTab({ view }: { view: CanvasView }) {
  return view === "announcements" ? <AnnouncementsPanel /> : <InboxPanel />;
}
