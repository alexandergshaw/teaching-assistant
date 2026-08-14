"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listCourseHubAction } from "../actions";
import { coursesInSession, type CourseSessionCandidate } from "@/lib/courses-in-session";
import { resolveFocusedCourse } from "@/lib/in-session-banner-display";
import {
  coursesUnderWay,
  coursesStartingSoon,
  upcomingCourseDates,
  formatUpcomingDate,
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
 *    cases). Still a row of course chips, unchanged in look and behaviour.
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
 * course. Nothing is capped or truncated: both lists render as chips inside
 * ONE horizontally-scrolling strip (the "strip" element in the JSX below),
 * courses first and then upcoming dates, so the banner's height never
 * depends on how many of either there are. This replaced an earlier design
 * that capped each list and appended a standalone, pluralized overflow note
 * past each cap - a dead end with no control that ever revealed the rest,
 * which both hid real information behind a note and grew the banner taller
 * with every entry up to the cap. Horizontal overflow is not that same
 * failure mode: every chip stays in the DOM and the accessibility tree, is
 * reachable by Tab (which
 * scrolls it into view automatically - native behaviour, not reimplemented
 * here) and by touch/trackpad scroll, and the strip's own right-edge fade
 * (see .stripFade below) signals there may be more to scroll rather than
 * hiding that fact silently.
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
          {/* stripWrap carries the id aria-controls resolves to (unchanged
              from before this compaction - it must stay ONE element
              containing everything the toggle discloses) and is the
              position: relative anchor .stripFade below is absolutely
              positioned against, since the fade must NOT scroll away with
              .strip's own content. */}
          <div id="in-session-banner-content" className={styles.stripWrap}>
            {/* ONE horizontally-scrolling strip replaces the old stacked
                "chip row, then up to six full-width rows, then a truncation
                note" layout: courses first, then upcoming dates, as two
                separate lists laid side by side rather than merged into one
                flat list - a bare course name ("Biology 101") and a dated
                entry ("Biology 101, Grades due, Today, Mar 10") are
                different kinds of thing, and merging them would make the
                bare course name ambiguous among the dated entries. Distinct
                aria-labels on each <ul> below say which is which for anyone
                not reading the visual layout. flex-wrap: nowrap plus
                flex-shrink: 0 on both lists (CSS module) is what keeps this
                exactly one line tall regardless of how many courses or
                dates there are - see .strip's own comment for the
                second-clipping-context reasoning behind its padding. The
                strip itself carries no tabIndex: it is not a tab stop, and
                keyboard users reach every chip through the chips themselves
                - focusing an off-screen one scrolls it into view by native
                browser behaviour. .contentInner, the immediate ancestor,
                does clip overflow (overflow: clip - see its own comment in
                the CSS module for why not overflow: hidden), but has none
                of its own once the accordion is open, so it is never a
                second scroll container - .strip below is the one element
                that actually scrolls, and it is what native focus-into-view
                moves. */}
            <div className={styles.strip}>
              {inSession.length > 0 && (
                <ul className={styles.courseList} role="list" aria-label="Courses in session">
                  {inSession.map((course) => (
                    // role="listitem" alongside the <ul>'s role="list": both
                    // lists are display: flex, which blockifies the <li>
                    // children away from display: list-item - the condition
                    // under which WebKit drops the implicit listitem role
                    // even with role="list" already set on the <ul> (the
                    // TaskAttachmentsDialog.tsx precedent this follows sets
                    // both for the same reason).
                    <li key={course.id} role="listitem">
                      <button
                        type="button"
                        className={styles.courseChip}
                        onClick={() => handleSelect(course)}
                      >
                        {course.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {upcoming.length > 0 && (
                <ul className={styles.upcomingList} role="list" aria-label="Upcoming dates">
                  {upcoming.map((entry) => (
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
                            node between the spans) so the three segments
                            concatenate into space-separated words in the
                            button's accessible name - that has never
                            depended on layout. Whether the same leading
                            spaces also render as VISIBLE separators for a
                            sighted user does depend on layout: see
                            .upcomingItem's own comment in the CSS module for
                            why this chip is display: inline-block rather
                            than inline-flex - the earlier value blockified
                            each span into its own flex item and silently
                            collapsed the leading space at render time even
                            though the text node itself was untouched. */}
                        <span className={styles.upcomingLabel}>{" "}{entry.label}</span>
                        <span className={styles.upcomingDate}>{" "}{formatUpcomingDate(entry.date, entry.time, now)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Static right-edge fade: a scrolling strip with no visual
                signal that there is more content is its own kind of hiding.
                A conditional version (visible only while there is actually
                more to scroll) needs either a JS scroll listener - which
                this banner deliberately has none of, relying only on the
                ResizeObserver above for its one external subscription - or
                mask-image plus scroll-timeline/animation-timeline, which is
                not safe to rely on across browsers yet. A plain static fade
                is the sanctioned fallback for exactly that situation.
                aria-hidden and pointer-events: none keep it decorative only
                - out of the accessibility tree and out of the click/hover
                target area, so it can never sit on top of the last chip and
                swallow a click. */}
            <div className={styles.stripFade} aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
