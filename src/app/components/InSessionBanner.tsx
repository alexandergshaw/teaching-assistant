"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listCourseHubAction } from "../actions";
import { coursesInSession, type CourseSessionCandidate } from "@/lib/courses-in-session";
import { limitDisplayedCourses, resolveFocusedCourse } from "@/lib/in-session-banner-display";
import {
  coursesUnderWay,
  coursesStartingSoon,
  upcomingCourseDates,
  formatUpcomingDate,
  MAX_VISIBLE_UPCOMING_DATES,
  type CourseUpcomingCandidate,
  type UpcomingCourseDate,
} from "@/lib/course-upcoming-dates";
import styles from "./InSessionBanner.module.css";

// Same ta- prefixed, "true"/"false" string convention every other persisted
// disclosure in this app uses (see WorkflowsTab.tsx's ta-workflows-steps-open
// and friends).
const STORAGE_KEY = "ta-in-session-banner-open";

// Mirrors this component's own rendered height into a CSS custom property
// (defined with a 0px default in globals.css) - see the height-sync effect
// below for why.
const HEIGHT_VAR = "--in-session-banner-height";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <span className={`${styles.chevron} ${open ? styles.chevronOpen : styles.chevronClosed}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export interface InSessionBannerProps {
  /**
   * Called instead of navigating when the instructor clicks an in-session
   * course. Only page.tsx (the one route that actually mounts the Courses
   * tab table) can act on this in-page, so it is the only caller that
   * passes it - TopBar renders this banner on every route (Knowledge,
   * Account/*), and those have nowhere to switch a tab to, so this
   * component falls back to a real navigation to "/" itself when the prop
   * is omitted (see handleSelect below).
   */
  onSelectCourse?: (course: CourseSessionCandidate) => void;
}

/**
 * Sticky, read-only banner directly below the app header (rendered by
 * TopBar.tsx). It is no longer only "which courses are in session" - it now
 * carries TWO independent signals off the same course list:
 *  - which of the owner's courses are currently "in session" - purely
 *    derived from each course's start/end/breaks dates via
 *    src/lib/courses-in-session.ts (see that module for exactly what "in
 *    session" means, including the missing-date and break-period edge
 *    cases). Still the chip row, unchanged.
 *  - upcoming ONE-OFF dates - grades-due, class-end, break-start and
 *    one-off checklist deadlines for courses whose term is under way, plus
 *    the start date of courses about to begin - via
 *    src/lib/course-upcoming-dates.ts (see that module for exactly which
 *    dates count and why coursesUnderWay is a deliberately broader net than
 *    coursesInSession).
 *
 * Read-only except for navigation: clicking a course chip or an upcoming
 * entry is the only interaction, and it only takes the instructor to that
 * course in the Courses tab table (see onSelectCourse above and
 * handleSelect/handleUpcomingSelect below) - nothing here ever mutates a
 * course. Long rosters are capped - MAX_VISIBLE_IN_SESSION_COURSES chips and
 * MAX_VISIBLE_UPCOMING_DATES upcoming entries (both via limitDisplayedCourses,
 * shared across both lists rather than a second cap helper) - with a
 * standalone, pluralized overflow note past each cap (round-3 finding 3a - a
 * bare "+N more" means nothing read out of the visual context of trailing
 * the row it summarizes), so the bar reads as one calm strip whether one
 * course or a dozen are involved.
 *
 * Collapsible; the open/closed state persists across reloads under
 * STORAGE_KEY, the same ta--prefixed localStorage convention every other
 * disclosure in this app already uses.
 *
 * Renders nothing (not even a collapsed sliver) in three cases: while the
 * course list is still loading, if it fails to load, and once loaded when
 * NEITHER list has anything to report (zero in session AND zero upcoming
 * entries). All three collapse to the same "say nothing" outcome
 * deliberately - a banner with nothing true to report is worse than no
 * banner, and never rendering a transient state is what keeps a loading or
 * error moment from ever flashing a wrong "0 in session" (or a raw error) at
 * the user before the real data arrives. --in-session-banner-height (see
 * globals.css) is forced to 0 in that same state, so nothing sticky below
 * this component ever reserves space for it.
 *
 * The component reads the clock once per render (`new Date()` below) and
 * additionally re-renders on its own at local midnight (see the
 * midnight-rollover effect further down) - otherwise "Today"/"Tomorrow" and
 * list membership itself would silently go stale the moment midnight passes
 * while the tab stays open.
 */
export default function InSessionBanner({ onSelectCourse }: InSessionBannerProps = {}) {
  const router = useRouter();
  // null = still loading OR the fetch failed (see the `"error" in result`
  // branch below); both render nothing, so this component never needs to
  // distinguish them.
  const [courses, setCourses] = useState<CourseUpcomingCandidate[] | null>(null);
  // Bumped by the midnight-rollover effect below purely to force a
  // re-render; its value is never read. Widening state (courses) already
  // triggers a re-render on load, but nothing else does once the clock ticks
  // past midnight with no new data - this is what keeps "Today"/"Tomorrow"
  // and list membership fresh across that boundary (AC11).
  const [, forceMidnightRerender] = useState(0);
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(STORAGE_KEY);
    // No stored preference yet -> default to expanded. This is new chrome;
    // it should be visible until the instructor actively collapses it, not
    // the other way around.
    return saved === null ? true : saved === "true";
  });
  // HTMLElement, not HTMLDivElement: the outer element is a <section>
  // (round-2 finding 2 - see that element's own comment below for why
  // <section> rather than <nav>), and section's ref type is HTMLElement,
  // same as nav's would have been.
  const bannerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in result) {
        // Never show the raw error - log it for diagnostics (matching this
        // codebase's console.error convention elsewhere, e.g.
        // src/lib/supabase/courses.ts) and fall back to the same "say
        // nothing" state as still-loading. (round-3 finding 3g: this used to
        // be prefixed "AC6:", a cross-reference to an older document that now
        // points at an unrelated criterion; the sentence stands on its own.)
        console.error("[InSessionBanner] Could not load courses:", result.error);
        return;
      }
      setCourses(result.courses);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Read once per render and reused for every list below, rather than a
  // separate `new Date()` per computation - all four lists should agree on
  // exactly the same instant of "now", and this is also the render-time
  // clock read the module comment on course-upcoming-dates.ts refers to as
  // this component's job, not that pure module's.
  const now = new Date();
  const inSession = courses ? coursesInSession(courses, now) : [];
  const underWay = courses ? coursesUnderWay(courses, now) : [];
  const startingSoon = courses ? coursesStartingSoon(courses, now) : [];
  const upcoming = courses ? upcomingCourseDates(underWay, startingSoon, now) : [];
  // AC8: renders when EITHER list has something to report, not only when a
  // course is in session - a course on break with a grades-due date coming
  // up still deserves a banner even though nothing is meeting today.
  const shouldRender = inSession.length > 0 || upcoming.length > 0;

  // AC11: schedules a re-render at the next local midnight (plus a small
  // margin so it lands after, not on, the boundary), then reschedules for
  // the following one - the delay is always computed from a freshly-read
  // clock inside the effect, never a value captured at mount, so a device
  // put to sleep and woken up later still reschedules against the real
  // current time rather than a stale calculation. This is the only place in
  // this component allowed to introduce a NEW clock read beyond the
  // pre-existing render-time one above.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextMidnight = () => {
      const current = new Date();
      const nextMidnight = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 1,
        0,
        0,
        1,
        0
      );
      const delay = nextMidnight.getTime() - current.getTime();
      timeoutId = setTimeout(() => {
        forceMidnightRerender((n) => n + 1);
        scheduleNextMidnight();
      }, delay);
    };
    scheduleNextMidnight();
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  // Keeps --in-session-banner-height mirrored to this component's own actual
  // rendered height - it collapses/expands (the accordion transition above)
  // and its content depends on how many courses are in session, so a
  // hardcoded offset would leave a gap or an overlap under whatever's stuck
  // below it (page.tsx's Tabs bar, ModulesView's ccStickyHeader) the moment
  // either of those things changes. A ResizeObserver keeps this correct
  // through the collapse/expand transition too, not just at its two
  // endpoints. This is the "subscribe to an external system, update it from
  // a callback" effect shape the lint rule on synchronous setState-in-effect
  // is designed to allow - and there is no setState here at all, only a DOM
  // style write, so it does not apply regardless.
  useEffect(() => {
    if (!shouldRender) {
      document.documentElement.style.setProperty(HEIGHT_VAR, "0px");
      return;
    }
    const el = bannerRef.current;
    if (!el) return;
    const sync = () => {
      document.documentElement.style.setProperty(HEIGHT_VAR, `${el.getBoundingClientRect().height}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldRender]);

  // Belt-and-suspenders: if this component unmounts outright (every route
  // that renders TopBar going away at once, e.g. sign-out) reset the offset
  // rather than leave a stale non-zero value on <html> - style properties set
  // there survive a client-side route change since the element itself never
  // unmounts.
  useEffect(() => {
    return () => {
      document.documentElement.style.setProperty(HEIGHT_VAR, "0px");
    };
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      } catch {
        // ignore storage write failures
      }
      return next;
    });
  };

  const handleSelect = (course: CourseSessionCandidate) => {
    if (onSelectCourse) {
      onSelectCourse(course);
      return;
    }
    router.push(`/?tab=courses&focusCourse=${encodeURIComponent(course.id)}`);
  };

  // An UpcomingCourseDate carries only courseId, so it is resolved back to a
  // real course via resolveFocusedCourse (the same lookup the rest of the
  // app uses for a possibly-stale id) before handleSelect ever sees it -
  // handleSelect itself keeps its existing CourseSessionCandidate signature
  // unchanged (AC9/AC12). A click that resolves to no course (the list went
  // stale between render and click) is silently ignored rather than
  // navigating somewhere wrong.
  const handleUpcomingSelect = (entry: UpcomingCourseDate) => {
    const course = resolveFocusedCourse(courses ?? [], entry.courseId);
    if (!course) return;
    handleSelect(course);
  };

  if (!shouldRender) return null;

  const { visible, overflowCount } = limitDisplayedCourses(inSession);
  const { visible: visibleUpcoming, overflowCount: upcomingOverflowCount } = limitDisplayedCourses(
    upcoming,
    MAX_VISIBLE_UPCOMING_DATES
  );

  return (
    // <section aria-label="...">, not <nav>: round 1 used <nav> here to give
    // this strip a landmark (finding 12), since it previously sat between
    // <header> and <main> outside every landmark and could not be jumped to.
    // But TopBar.tsx already renders its OWN <nav className={styles.actions}>
    // with NO accessible name directly above this component on every route
    // (TopBar.tsx is out of scope for this hand-off) - two same-type
    // landmarks where one is unnamed is the exact ambiguity the
    // landmark-labelling rule exists to prevent, and <nav> here created it
    // (round-2 finding 2). <nav> was also the wrong role on the merits: this
    // strip's payload is STATUS information, and the collapsed state
    // contains no navigation at all. A <section> WITH an accessible name
    // maps to role="region", which models a status strip honestly while
    // still giving it its own distinct, labelled, jump-to-able landmark - do
    // NOT "correct" this back to <nav>. <section> is display: block like
    // <nav>, so position: sticky and bannerRef's HTMLElement typing both
    // behave identically.
    <section ref={bannerRef} className={styles.banner} aria-label="Courses in session and upcoming dates">
      <button
        type="button"
        className={styles.toggle}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="in-session-banner-content"
      >
        <ChevronIcon open={open} />
        {/* Accessible name derivation for this toggle (round-3 finding 4
            requires re-deriving this after moving the two visible nbsps
            below into .srOnly spans): concatenating every text node in DOM
            order, with both segments present, gives "In session now" + NBSP
            + "3" + NBSP + "courses" + NBSP + "Upcoming" + NBSP + "2" + NBSP +
            "dates" - i.e.
            "In session now\u00A03\u00A0courses\u00A0Upcoming\u00A02\u00A0dates",
            which assistive tech renders as "In session now 3 courses
            Upcoming 2 dates". That is byte-for-byte the same string round 2
            produced: every nbsp that moved kept its exact position in the
            text-node sequence, only its layout box changed (a visible run
            vs. an out-of-flow .srOnly span). */}
        <span className={styles.label}>
          {inSession.length > 0 && (
            <span className={styles.labelSegment}>
              {/* Round 1 added a {" "} node and a visually-hidden unit after
                  the bare numeral (finding 7) so the button's accessible
                  name would read as "In session now 3 courses" instead of
                  the concatenated "In session now3". A PLAIN {" "} does not
                  actually survive to do that: CSS's whitespace-processing
                  model (which the accessible-name computation follows) trims
                  a trailing space at the end of a text run inside
                  .labelSegment (inline-flex) the same way it trims trailing
                  space at the end of a line - so round 1's fix was itself
                  silently undone by rendering (round-2 finding 1). U+00A0
                  (non-breaking space) is not one of the characters CSS ever
                  collapses or trims, so it is what actually survives here.
                  Do NOT "simplify" this back to a plain {" "} - that is
                  exactly what reopens this bug.

                  The nbsp is wrapped in its own .srOnly span rather than
                  left as a bare text node: a bare nbsp DOES render a real
                  glyph (it is never collapsed or trimmed - see above), which
                  was widening the gap between "In session now" and the count
                  pill by about 4px beyond .labelSegment's intended 8px gap
                  (round-3 finding 4). A position: absolute .srOnly span
                  takes it out of flex flow entirely, so it costs no width,
                  while leaving the DOM text-concatenation order - and so the
                  accessible name - byte-for-byte identical; see the
                  derivation above .label. */}
              In session now
              <span className={styles.srOnly}>{"\u00A0"}</span>
              <span className={styles.count}>
                {inSession.length}
                <span className={styles.srOnly}>{"\u00A0courses"}</span>
              </span>
            </span>
          )}
          {/* This position sits directly between two flex items of .label
              (inline-flex). CSS Flexbox section 4 only excuses a
              WHITESPACE-ONLY text sequence between flex items from becoming
              an anonymous flex item when every character in it is one
              `white-space` would collapse - and CSS Text 3 excludes U+00A0
              from that set, the same fact relied on above for why a bare
              nbsp survives CSS's trimming there. So a bare nbsp text node
              right here WOULD still render (round-3 finding 3b - an earlier
              version of this comment claimed the opposite, that nothing
              renders here "regardless of which whitespace character it
              holds"). The .srOnly span is used anyway because it sidesteps
              the question entirely: taking the separator out of flex flow
              with position: absolute means it can never become a flex item,
              rendered or not, so there is nothing here to reason about. The
              nbsp inside it is what actually separates "...3 courses" from
              "Upcoming..." in the toggle's accessible name. Visual spacing
              is unaffected either way - .label's own gap: 16px already
              spaces the two .labelSegments, exactly as it did before this
              element existed. */}
          {inSession.length > 0 && upcoming.length > 0 && (
            <span className={styles.srOnly}>{"\u00A0"}</span>
          )}
          {upcoming.length > 0 && (
            <span className={styles.labelSegment}>
              {/* Same nbsp-in-.srOnly treatment as the "In session now"
                  segment above, for the same reason (round-3 finding 4). */}
              Upcoming
              <span className={styles.srOnly}>{"\u00A0"}</span>
              <span className={styles.countNeutral}>
                {upcoming.length}
                <span className={styles.srOnly}>{"\u00A0dates"}</span>
              </span>
            </span>
          )}
        </span>
      </button>
      <div className={`${styles.contentWrap} ${open ? styles.contentWrapOpen : ""}`}>
        <div className={styles.contentInner}>
          <div id="in-session-banner-content">
            {visible.length > 0 && (
              <div className={styles.content}>
                {visible.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    className={styles.courseChip}
                    onClick={() => handleSelect(course)}
                  >
                    {course.name}
                  </button>
                ))}
                {/* Standalone, pluralized text, not "+N more" - the same
                    treatment round 1 gave the upcoming list's own overflow
                    note (finding 11) but left this one without (round-2
                    finding 5): "+2 more" means nothing read out of the
                    visual context of trailing the chip row. */}
                {overflowCount > 0 && (
                  <span className={styles.overflowNote}>
                    {overflowCount} more {overflowCount === 1 ? "course" : "courses"} in session
                  </span>
                )}
              </div>
            )}
            {visibleUpcoming.length > 0 && (
              <>
                {/* role="list" on the <ul> AND role="listitem" on each <li>:
                    list-style: none on .upcomingList strips the implicit
                    list role in Safari/VoiceOver (finding 10), so the item
                    count ("6 items") is not available for free the way plain
                    <ul>/<li> markup normally gives it - same fix
                    TaskAttachmentsDialog.tsx already applies. round-1's fix
                    only set role="list" on the <ul>, but .upcomingList is
                    ALSO display: flex, which blockifies the <li> children
                    away from display: list-item - the exact second
                    condition under which WebKit drops the implicit listitem
                    role too, so a lone role="list" can still report "list, 0
                    items" (round-2 finding 3). TaskAttachmentsDialog.tsx,
                    the very precedent this cites, sets BOTH roles for this
                    reason - it was only half-followed here. */}
                <ul className={styles.upcomingList} role="list">
                  {visibleUpcoming.map((entry) => (
                    <li
                      key={`${entry.courseId}-${entry.kind}-${entry.date}-${entry.time ?? ""}-${entry.label}-${entry.sourceId ?? ""}`}
                      role="listitem"
                    >
                      <button
                        type="button"
                        className={styles.upcomingItem}
                        onClick={() => handleUpcomingSelect(entry)}
                      >
                        <span className={styles.upcomingCourseName}>{entry.courseName}</span>
                        {/* Leading space kept IN the text node (not a sibling
                            node between the spans) so the three segments read
                            as space-separated words in the button's accessible
                            name (concatenated child text - AC9). (This is not,
                            as an earlier comment here claimed, about avoiding
                            an extra flex item next to a `gap` - .upcomingItem
                            is display: block and declares no gap at all; see
                            that class's own comment in the CSS module. The
                            real reason is the same whitespace-in-accessible-
                            name issue the toggle's counts have above.) */}
                        <span className={styles.upcomingLabel}>{" "}{entry.label}</span>
                        <span className={styles.upcomingDate}>{" "}{formatUpcomingDate(entry.date, entry.time, now)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {/* Rendered as a SIBLING after the list, not an <li> inside
                    it: an <li> here made a screen reader announce "list, 7
                    items" and read this truncation note as a peer of the
                    real entries (finding 11). Text stands alone rather than
                    "+N more", which depended on visually trailing the list to
                    make sense. */}
                {/* overflowNoteList adds the left inset .overflowNote alone
                    does not carry: as a direct sibling of </ul> rather than
                    a child of .content, this <p>'s parent
                    (#in-session-banner-content) contributes no padding of
                    its own, so plain .overflowNote's 4px would leave it
                    sitting 4px from the banner edge while every row above it
                    sits at 24px (.upcomingList) + 8px (.upcomingItem) = 32px
                    (round-2 finding 6). Applied only here - the chip row's
                    overflow span stays on plain .overflowNote, since it
                    already sits inside .content's own 24px padding. */}
                {upcomingOverflowCount > 0 && (
                  <p className={`${styles.overflowNote} ${styles.overflowNoteList}`}>
                    {upcomingOverflowCount} more upcoming {upcomingOverflowCount === 1 ? "date" : "dates"}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
