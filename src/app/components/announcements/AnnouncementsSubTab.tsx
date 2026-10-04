import TabHeader from "../TabHeader";
import type { AnnouncementsView } from "../manual/manual-rail";

// ANNOUNCEMENTS-TAB wave A-W1: the empty shell the new Announcements sub-tab
// mounts. No announcement tool lives here yet - the Recording and LMS
// announcement surfaces are untouched until A-W2 moves them in. `view` is the
// inner selection (post / walkthrough) the inner nav row above already shows.
export default function AnnouncementsSubTab({ view }: { view: AnnouncementsView }) {
  return (
    <section aria-label="Announcements" data-announcements-view={view}>
      <TabHeader
        eyebrow="Tools"
        title="Announcements"
        subtitle="Announcement tools are being moved here."
      />
    </section>
  );
}
