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
  UPCOMING_HORIZON_DAYS,
  UPCOMING_LOOKBACK_DAYS,
  type CourseUpcomingCandidate,
  type UpcomingCourseDate,
} from "@/lib/course-upcoming-dates";
import { upcomingEntryUrgency } from "@/lib/upcoming-entry-urgency";
import { summarizeUpcoming } from "@/lib/upcoming-summary-label";
import styles from "./InSessionBanner.module.css";

// Same ta- prefixed, "true"/"false" string convention every other persisted
// disclosure in this app uses (see WorkflowsTab.tsx's ta-workflows-steps-open
// and friends).
const STORAGE_KEY = "ta-in-session-banner-open";

// Mirrors this component's own rendered height into a CSS custom property
// (defined with a 0px default in globals.css) - see the height-sync effect
// below for why.
const HEIGHT_VAR = "--in-session-banner-height";

// A load failure gets exactly one silent retry before the banner admits
// defeat and shows the "unavailable" row (see the load effect below). A
// short, fixed delay - this is a background retry for a transient blip, not a
// backoff strategy.
const RETRY_DELAY_MS = 1500;

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
 * TopBar.tsx). It carries TWO independent signals off the same course list:
 *  - which of the owner's courses are running THIS TERM - purely derived
 *    from each course's start/end/breaks dates via
 *    src/lib/courses-in-session.ts (see that module for exactly what
 *    membership means, including the missing-date and break-period edge
 *    cases). A row of course chips. Labelled "Teaching this term", not
 *    "in session now" - `coursesInSession` compares calendar-date strings
 *    only, with no clock, weekday or meeting-time check, so a Tue/Thu
 *    9-10am course would read "in session now" every day, all fifteen
 *    weeks, including a Sunday at 11pm. "Teaching this term" makes no claim
 *    this data cannot back up; "now" would be false most hours of most
 *    days. (`registry-helpers.ts`'s `parseDayTime` could answer the sharper
 *    question, but it imports `@/app/actions` - pulling it into this client
 *    component would drag a server action into the client bundle, the exact
 *    hazard the registry-client-bundle guard exists for. Extracting a
 *    client-safe day/time parser into its own leaf module is a real option
 *    for later, not attempted here.)
 *  - upcoming ONE-OFF dates - grades-due, class-end, break-start and
 *    one-off checklist deadlines for courses whose term is under way, plus
 *    the start date of courses about to begin - via
 *    src/lib/course-upcoming-dates.ts (see that module for exactly which
 *    dates count and why coursesUnderWay is a deliberately broader net than
 *    coursesInSession), with a short (`UPCOMING_LOOKBACK_DAYS`) lookback so a
 *    deadline that passed a day or two ago does not simply vanish, and each
 *    entry additionally carries an urgency mark (src/lib/upcoming-entry-
 *    urgency.ts) - a leading dot plus an "Overdue" word for anything already
 *    past, layered on top of (never replacing) `formatUpcomingDate`'s own
 *    relative wording.
 *
 * The two lists render DATES FIRST, then courses, inside one horizontally-
 * scrolling strip, each preceded by a small tracked-uppercase zone label
 * ("Due" / "Term") and separated by a real vertical divider. Dates lead
 * because they are the perishable half - the ranked, time-sensitive
 * information - while "which courses are running" is comparatively inert and
 * does not change hour to hour. The upcoming chip is now the VISUALLY LOUD
 * one (bordered, filled, bold) and the term chip is the quiet one (borderless,
 * secondary-coloured) - the inverse of this banner's very first version, which
 * put the loud treatment on the fact the instructor already knows and the
 * quiet treatment on the fact that costs money if missed.
 *
 * Read-only except for navigation: clicking a course chip or an upcoming
 * entry is the only interaction, and it only takes the instructor to that
 * course in the Courses tab table (see onSelectCourse above and
 * handleSelect/handleUpcomingSelect below) - nothing here ever mutates a
 * course. Nothing is capped or truncated: both lists render as chips inside
 * ONE horizontally-scrolling strip (the "strip" element in the JSX below),
 * so the banner's height never depends on how many of either there are.
 * Horizontal overflow is signalled, not hidden: every chip stays in the DOM
 * and the accessibility tree, is reachable by Tab (which scrolls it into
 * view automatically - native behaviour, not reimplemented here) and by
 * touch/trackpad scroll, and the strip's own right-edge fade (see .stripFade
 * below) signals there may be more to scroll rather than hiding that fact
 * silently.
 *
 * Collapsible; the open/closed state persists across reloads under
 * STORAGE_KEY, the same ta--prefixed localStorage convention every other
 * disclosure in this app already uses. The READ of that stored value is
 * wrapped in its own try/catch (unlike an earlier version of this component):
 * `localStorage.getItem` can THROW, not just fail silently or return null -
 * Safari with cookies/site data blocked, a sandboxed iframe, some enterprise
 * policies - and this runs inside a `useState` initializer during this
 * component's first client render, which TopBar.tsx mounts on EVERY route. An
 * uncaught throw there white-screens the whole app shell, not just this
 * banner - so it defaults to expanded on a throw, exactly like "no stored
 * preference yet".
 *
 * The toggle's collapsed row does not show a bare count for the upcoming
 * side any more - "Upcoming 2" cannot distinguish "two dates a fortnight
 * out" from "one due in ninety minutes" without expanding the strip. Since
 * `upcomingCourseDates` already returns its list sorted soonest-first, the
 * toggle instead carries the single most urgent entry plus a "+N more" tail
 * (`summarizeUpcoming`, src/lib/upcoming-summary-label.ts) - one line either
 * way, height unchanged, and it removes the expand click from the common
 * case entirely.
 *
 * Renders nothing (not even a collapsed sliver) while the course list is
 * still loading, or once loaded when NEITHER list has anything to report
 * (zero in session AND zero upcoming entries) - never flashing a wrong
 * "0 in session" (or a raw error) at the user before real data arrives.
 * --in-session-banner-height (see globals.css) is forced to 0 in that state,
 * so nothing sticky below this component ever reserves space for it. A load
 * failure gets exactly one silent retry (see the load effect below); only if
 * THAT also fails does the banner render something - a single collapsed row
 * reading "Course dates unavailable" with a manual retry button - which is a
 * claim of UNCERTAINTY, never a claim of zero, so it does not reopen the
 * say-nothing guarantee above.
 *
 * The component reads the clock once per render (`new Date()` below) and
 * additionally re-renders on its own at local midnight (see the
 * midnight-rollover effect further down) - otherwise "Today"/"Tomorrow" and
 * list membership itself would silently go stale the moment midnight passes
 * while the tab stays open.
 */
export default function InSessionBanner({ onSelectCourse }: InSessionBannerProps = {}) {
  const router = useRouter();
  // null = still loading OR a load attempt failed (see the load effect
  // below); both render nothing on their own - `failed` (below) is the only
  // thing that makes a failure visible, and only once the one retry is also
  // spent. This keeps the pre-existing "never flash a wrong zero" data
  // invariant intact: courses is never populated with a placeholder empty
  // array on error.
  const [courses, setCourses] = useState<CourseUpcomingCandidate[] | null>(null);
  // True only once an initial attempt AND its one retry have both failed.
  // Distinct from `courses === null` on purpose - see above.
  const [failed, setFailed] = useState(false);
  // Bumped by handleManualRetry to re-run the load effect on demand.
  const [retryToken, setRetryToken] = useState(0);
  // Bumped by the midnight-rollover effect below purely to force a
  // re-render; its value is never read. Widening state (courses) already
  // triggers a re-render on load, but nothing else does once the clock ticks
  // past midnight with no new data - this is what keeps "Today"/"Tomorrow"
  // and list membership fresh across that boundary (AC11).
  const [, forceMidnightRerender] = useState(0);
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // No stored preference yet -> default to expanded. This is new chrome;
      // it should be visible until the instructor actively collapses it, not
      // the other way around.
      return saved === null ? true : saved === "true";
    } catch {
      // localStorage ACCESS (not just a write) can throw - see this
      // component's own doc comment above. Same default as "nothing stored
      // yet": a storage failure is not distinguishable from that case from
      // here, and either way the safe default is expanded.
      return true;
    }
  });
  // A transient, visually-hidden notice announced through this component's
  // own aria-live region (the outer <section> below) when a click resolves
  // to no course - B10: previously that click did nothing and said nothing.
  const [staleClickNotice, setStaleClickNotice] = useState("");
  // HTMLElement, not HTMLDivElement: the outer element is a <section>
  // (round-2 finding 2 - see that element's own comment below for why
  // <section> rather than <nav>), and section's ref type is HTMLElement,
  // same as nav's would have been.
  const bannerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const attempt = async (isRetry: boolean) => {
      const result = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in result) {
        // Never show the raw error - log it for diagnostics (matching this
        // codebase's console.error convention elsewhere, e.g.
        // src/lib/supabase/courses.ts).
        console.error("[InSessionBanner] Could not load courses:", result.error);
        if (isRetry) {
          // Both the original attempt and its one retry failed - this is the
          // only path that sets `failed`, and it never touches `courses`.
          setFailed(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        if (cancelled) return;
        await attempt(true);
        return;
      }
      setFailed(false);
      setCourses(result.courses);
    };
    attempt(false);
    return () => {
      cancelled = true;
    };
    // retryToken is a dependency purely to re-run this effect on demand from
    // handleManualRetry - its value is never read.
  }, [retryToken]);

  const handleManualRetry = () => {
    setFailed(false);
    setRetryToken((n) => n + 1);
  };

  // Read once per render and reused for every list below, rather than a
  // separate `new Date()` per computation - all four lists should agree on
  // exactly the same instant of "now", and this is also the render-time
  // clock read the module comment on course-upcoming-dates.ts refers to as
  // this component's job, not that pure module's.
  const now = new Date();
  const inSession = courses ? coursesInSession(courses, now) : [];
  const underWay = courses ? coursesUnderWay(courses, now) : [];
  const startingSoon = courses ? coursesStartingSoon(courses, now) : [];
  const upcoming = courses
    ? upcomingCourseDates(underWay, startingSoon, now, UPCOMING_HORIZON_DAYS, UPCOMING_LOOKBACK_DAYS)
    : [];
  // AC8: renders when EITHER list has something to report, not only when a
  // course is in session - a course on break with a grades-due date coming
  // up still deserves a banner even though nothing is meeting today. `failed`
  // also forces a render, independent of either count (see this component's
  // own doc comment on the unavailable-row state).
  const hasContent = inSession.length > 0 || upcoming.length > 0;
  const shouldRender = failed || hasContent;
  const summary = summarizeUpcoming(upcoming, now);

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
  // endpoints, and through the unavailable-row state too, since that state
  // also flips `shouldRender` to true and reuses the same bannerRef element.
  // This is the "subscribe to an external system, update it from a callback"
  // effect shape the lint rule on synchronous setState-in-effect is designed
  // to allow - and there is no setState here at all, only a DOM style write,
  // so it does not apply regardless.
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
  // stale between render and click) now sets a transient, visually-hidden
  // notice (announced via the section's own aria-live region below) instead
  // of silently doing nothing (B10) - previously this was a click with no
  // navigation and no feedback at all.
  const handleUpcomingSelect = (entry: UpcomingCourseDate) => {
    const course = resolveFocusedCourse(courses ?? [], entry.courseId);
    if (!course) {
      setStaleClickNotice(`${entry.courseName || "That course"} could not be opened - it may no longer exist.`);
      return;
    }
    setStaleClickNotice("");
    handleSelect(course);
  };

  if (!shouldRender) return null;

  if (failed) {
    return (
      // Same landmark and aria-live treatment as the success-path <section>
      // below (see that element's own comment for why <section>, not <nav>).
      // bannerRef stays on THIS element too, so the ResizeObserver mirror
      // above measures the unavailable row's real height exactly the same
      // way it measures the normal banner.
      <section
        ref={bannerRef}
        className={styles.banner}
        aria-label="Courses this term and upcoming dates"
        aria-live="polite"
      >
        <div className={styles.unavailableRow}>
          <span className={styles.unavailableText}>Course dates unavailable</span>
          <button type="button" className={styles.retryButton} onClick={handleManualRetry}>
            Retry
          </button>
        </div>
      </section>
    );
  }

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
    //
    // aria-live="polite" (new): nothing previously announced this banner
    // materialising after its fetch resolves, or its content changing at
    // local midnight (B10) - a screen-reader user past the header would
    // never hear either happen. Not aria-atomic, deliberately: only the text
    // that actually changed should be announced, not the entire strip
    // re-read on every count change.
    <section
      ref={bannerRef}
      className={styles.banner}
      aria-label="Courses this term and upcoming dates"
      aria-live="polite"
    >
      <button
        type="button"
        className={styles.toggle}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="in-session-banner-content"
      >
        <ChevronIcon open={open} />
        {/* Accessible name derivation for this toggle: concatenating every
            text node in DOM order, with both segments present, gives
            "Teaching this term" + NBSP + "3" + NBSP + "courses" + NBSP +
            "Next" + NBSP + "<label> <middle dot> <date text>[<middle dot>
            +N more]" - e.g. "Teaching this term 3 courses Next Grades due
            · Today, Mar 10 at 5:00 PM · +1 more". The unit words after each
            bare numeral are visually-hidden (.srOnly spans) so the visible
            "3" reads as "3 courses" to assistive tech without a duplicate
            visible label; the due-summary segment carries no such hidden
            suffix because its own visible text is already self-describing.
            Every segment separator is a NON-BREAKING space in its own
            .srOnly span, not a plain {" "} - CSS's whitespace-processing
            model (which the accessible-name computation follows) trims a
            plain space at the edge of a text run inside .labelSegment
            (inline-flex), so a bare {" "} would be silently discarded at
            render time. U+00A0 is never collapsed or trimmed, so it is what
            actually separates the words here. It is wrapped in its own
            position: absolute .srOnly span (not left as a bare text node)
            so it costs no flex-item width of its own - a bare nbsp text
            node DOES render a real (if invisible-looking) glyph and would
            otherwise widen the gap between words beyond .labelSegment's
            intended 8px gap. Do NOT "simplify" any of this back to a plain
            {" "} - that is exactly what reopens the bug this idiom fixes. */}
        <span className={styles.label}>
          {inSession.length > 0 && (
            <span className={styles.labelSegment}>
              Teaching this term
              <span className={styles.srOnly}>{"\u00A0"}</span>
              <span className={styles.count}>
                {inSession.length}
                <span className={styles.srOnly}>{"\u00A0courses"}</span>
              </span>
            </span>
          )}
          {inSession.length > 0 && summary && <span className={styles.srOnly}>{"\u00A0"}</span>}
          {summary && (
            <span className={styles.labelSegment}>
              Next
              <span className={styles.srOnly}>{"\u00A0"}</span>
              <span className={styles.dueSummary}>
                <span className={styles.dueSummaryText}>
                  {summary.label} {"·"} {summary.dateText}
                  {summary.moreCount > 0 ? ` · +${summary.moreCount} more` : ""}
                </span>
              </span>
            </span>
          )}
        </span>
      </button>
      {/* Visually-hidden, announced through the section's own aria-live
          region above - see handleUpcomingSelect's own comment (B10). */}
      <span className={styles.srOnly}>{staleClickNotice}</span>
      <div className={`${styles.contentWrap} ${open ? styles.contentWrapOpen : ""}`}>
        <div className={styles.contentInner}>
          {/* stripWrap carries the id aria-controls resolves to (it must
              stay ONE element containing everything the toggle discloses)
              and is the position: relative anchor .stripFade below is
              absolutely positioned against, since the fade must NOT scroll
              away with .strip's own content. */}
          <div id="in-session-banner-content" className={styles.stripWrap}>
            {/* Upcoming dates FIRST, then courses (B5): this used to be
                courses-then-dates, fixed, in this same nowrap/overflow-x
                strip - at six courses and eight dates roughly 37% sat
                off-screen, and past about fourteen courses in session EVERY
                upcoming date was off-screen at rest with no visible evidence
                they existed beyond the toggle's old bare count. Reversing
                the order puts the ranked, perishable half (upcoming dates)
                where it is never scrolled away, and leaves the
                comparatively inert "which courses are running" half to
                absorb the overflow instead. Each zone gets its own small
                tracked-uppercase label ("Due" / "Term", AM5's micro-label
                idiom - font-size-2xs/700/0.06em/text-secondary) and the two
                are separated by a real 1px vertical divider
                (align-self: stretch, zero added height) - both are new
                sighted-user affordances for the group boundary that
                previously existed only in the two <ul>'s aria-labels.
                flex-wrap: nowrap plus flex-shrink: 0 on both lists (CSS
                module) is what keeps this exactly one line tall regardless
                of how many courses or dates there are - see .strip's own
                comment for the second-clipping-context reasoning behind its
                padding. The strip itself carries no tabIndex: it is not a
                tab stop, and keyboard users reach every chip through the
                chips themselves - focusing an off-screen one scrolls it into
                view by native browser behaviour. .contentInner, the
                immediate ancestor, does clip overflow (overflow: clip - see
                its own comment in the CSS module for why not
                overflow: hidden), but has none of its own once the accordion
                is open, so it is never a second scroll container - .strip
                below is the one element that actually scrolls, and it is
                what native focus-into-view moves. */}
            <div className={styles.strip}>
              {upcoming.length > 0 && (
                <>
                  <span className={styles.zoneLabel} aria-hidden="true">
                    Due
                  </span>
                  <ul className={styles.upcomingList} role="list" aria-label="Upcoming dates">
                    {upcoming.map((entry) => {
                      const urgency = upcomingEntryUrgency(entry, now);
                      const dateText = formatUpcomingDate(entry.date, entry.time, now);
                      // Full string for the hover title (B4) - sighted users
                      // previously had no way to recover text the chip's own
                      // ellipsis clipped, since only the accessible name
                      // (screen readers) carried the untruncated text.
                      const fullText = `${entry.courseName} — ${entry.label} — ${dateText}`;
                      return (
                        <li
                          key={`${entry.courseId}-${entry.kind}-${entry.date}-${entry.time ?? ""}-${entry.label}-${entry.sourceId ?? ""}`}
                          role="listitem"
                        >
                          <button
                            type="button"
                            className={styles.upcomingItem}
                            title={fullText}
                            onClick={() => handleUpcomingSelect(entry)}
                          >
                            {/* Order is DATE -> label -> course name (B4),
                                reversed from this chip's original
                                name -> label -> date. Truncation
                                (white-space: nowrap; text-overflow: ellipsis
                                on the button) always destroys whatever comes
                                LAST - previously that was always the date
                                (" at 5:00 PM" lost every time it was
                                present), for information the instructor
                                cannot see anywhere else. The course name now
                                absorbs truncation instead: it is already
                                visible six pixels to the left as its own
                                chip in .courseList, so losing it here loses
                                nothing new. .upcomingCourseName additionally
                                carries its OWN max-width/ellipsis (a second,
                                tighter cap) so one very long name cannot
                                silently consume the label in between. The
                                leading space before .upcomingCourseName is a
                                SIBLING text node, not a child of that span -
                                see .upcomingCourseName's own comment in the
                                CSS module for why: that span is now
                                display: inline-block (required for its own
                                max-width/ellipsis to apply at all), and a
                                leading space INSIDE an inline-block is the
                                start of that box's own line, which CSS Text 3
                                collapses - the same failure mode this
                                chip's very first version already
                                documents for inline-flex. Keeping the space
                                as a sibling, in the button's own shared
                                inline formatting context, avoids that
                                entirely. */}
                            <span className={styles.upcomingDate}>
                              {/* The urgency dot (B9) is a non-colour mark,
                                  never the only signal - it is layered on
                                  top of position (dates lead the strip,
                                  B5) and the existing relative words
                                  ("Today"/"Tomorrow", plus "Overdue" added
                                  here) satisfy WCAG 1.4.1 before colour ever
                                  enters the picture; colour (via the -ink
                                  tokens, never a bare --warning/--danger) is
                                  the LAST and weakest layer, exactly per B9's
                                  stated priority. No dot at all for a plain
                                  future date - only "overdue" and "dueToday"
                                  carry one. */}
                              {urgency !== "upcoming" && (
                                <span
                                  aria-hidden="true"
                                  className={`${styles.urgencyDot} ${
                                    urgency === "overdue" ? styles.urgencyDotOverdue : styles.urgencyDotToday
                                  }`}
                                />
                              )}
                              {urgency === "overdue" ? "Overdue · " : ""}
                              {dateText}
                            </span>
                            <span className={styles.upcomingLabel}>{" "}{entry.label}</span>
                            {" "}
                            <span className={styles.upcomingCourseName}>{entry.courseName}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {inSession.length > 0 && upcoming.length > 0 && (
                <span className={styles.divider} aria-hidden="true" />
              )}
              {inSession.length > 0 && (
                <>
                  <span className={styles.zoneLabel} aria-hidden="true">
                    Term
                  </span>
                  <ul className={styles.courseList} role="list" aria-label="Courses teaching this term">
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
                </>
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
