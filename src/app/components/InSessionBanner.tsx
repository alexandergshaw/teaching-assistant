"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listCourseHubAction } from "../actions";
import { coursesInSession, type CourseSessionCandidate } from "@/lib/courses-in-session";
import { limitDisplayedCourses } from "@/lib/in-session-banner-display";
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
 * TopBar.tsx), listing which of the owner's courses are currently "in
 * session" - purely derived from each course's start/end/breaks dates via
 * src/lib/courses-in-session.ts (see that module for exactly what "in
 * session" means, including the missing-date and break-period edge cases).
 *
 * Read-only except for navigation: clicking a course chip is the only
 * interaction, and it only takes the instructor to that course in the
 * Courses tab table (see onSelectCourse above and handleSelect below) -
 * nothing here ever mutates a course. Long rosters are capped at
 * MAX_VISIBLE_IN_SESSION_COURSES chips (limitDisplayedCourses, in
 * in-session-banner-display.ts) with a plain "+N more" note past that, so
 * the bar reads as one calm line rather than wrapping into a wall of chips.
 *
 * Collapsible; the open/closed state persists across reloads under
 * STORAGE_KEY, the same ta--prefixed localStorage convention every other
 * disclosure in this app already uses.
 *
 * Renders nothing (not even a collapsed sliver) in three cases: while the
 * course list is still loading, if it fails to load, and once loaded when no
 * course is in session. All three collapse to the same "say nothing" outcome
 * deliberately - a banner with nothing true to report is worse than no
 * banner, and never rendering a transient state is what keeps a loading or
 * error moment from ever flashing a wrong "0 in session" (or a raw error) at
 * the user before the real data arrives. --in-session-banner-height (see
 * globals.css) is forced to 0 in that same state, so nothing sticky below
 * this component ever reserves space for it.
 */
export default function InSessionBanner({ onSelectCourse }: InSessionBannerProps = {}) {
  const router = useRouter();
  // null = still loading OR the fetch failed (see the catch-all below); both
  // render nothing, so this component never needs to distinguish them.
  const [courses, setCourses] = useState<CourseSessionCandidate[] | null>(null);
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(STORAGE_KEY);
    // No stored preference yet -> default to expanded. This is new chrome;
    // it should be visible until the instructor actively collapses it, not
    // the other way around.
    return saved === null ? true : saved === "true";
  });
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in result) {
        // AC6: never show the raw error - log it for diagnostics (matching
        // this codebase's console.error convention elsewhere, e.g.
        // src/lib/supabase/courses.ts) and fall back to the same "say
        // nothing" state as still-loading.
        console.error("[InSessionBanner] Could not load courses:", result.error);
        return;
      }
      setCourses(result.courses);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inSession = courses ? coursesInSession(courses, new Date()) : [];
  const shouldRender = inSession.length > 0;

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

  if (!shouldRender) return null;

  const { visible, overflowCount } = limitDisplayedCourses(inSession);

  return (
    <div ref={bannerRef} className={styles.banner}>
      <button
        type="button"
        className={styles.toggle}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="in-session-banner-content"
      >
        <ChevronIcon open={open} />
        <span className={styles.label}>
          In session now
          <span className={styles.count}>{inSession.length}</span>
        </span>
      </button>
      <div className={`${styles.contentWrap} ${open ? styles.contentWrapOpen : ""}`}>
        <div className={styles.contentInner}>
          <div className={styles.content} id="in-session-banner-content">
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
            {overflowCount > 0 && <span className={styles.overflowNote}>+{overflowCount} more</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
