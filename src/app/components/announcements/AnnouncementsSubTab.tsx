"use client";

import TabHeader from "../TabHeader";
import InstitutionSwitcher from "../InstitutionSwitcher";
import AnnouncementsPanel from "../canvas-tab/announcements-panel";
import BulkCourseMessagePanel from "../bulk-course-message/BulkCourseMessagePanel";
import type { AnnouncementsView } from "../manual/manual-rail";
import styles from "../../page.module.css";

// ANNOUNCEMENTS-TAB wave A-W2: the "Post an announcement" surface. The Canvas
// announcement composer and the course-wide message tool MOVED here from the
// LMS tab (CanvasTab no longer hosts either) - this file is the single mount
// site for both. page.tsx only renders this component for the "post" inner
// view; the "From a walkthrough" chip reveals the always-mounted capture panel
// that page.tsx keeps as a top-level sibling (a conditional mount would drop a
// live screen capture on every tab switch). `view` is still passed through so
// the section reports which inner view it is showing.
export default function AnnouncementsSubTab({ view }: { view: AnnouncementsView }) {
  return (
    <section aria-label="Announcements" data-announcements-view={view}>
      <TabHeader
        eyebrow="Tools"
        title="Announcements"
        subtitle="Post a Canvas announcement or message a whole course."
      />
      <div className={styles.field}>
        <label>Institution</label>
        <InstitutionSwitcher metric="both" />
      </div>
      <AnnouncementsPanel />
      <BulkCourseMessagePanel />
    </section>
  );
}
