"use client";

import { useEffect, useState } from "react";
import Chip from "@mui/material/Chip";
import { listCourseHubAction } from "../actions";
import { coursesInSession, type CourseSessionCandidate } from "@/lib/courses-in-session";
import styles from "./InSessionBanner.module.css";

// Same ta- prefixed, "true"/"false" string convention every other persisted
// disclosure in this app uses (see WorkflowsTab.tsx's ta-workflows-steps-open
// and friends).
const STORAGE_KEY = "ta-in-session-banner-open";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <span className={`${styles.chevron} ${open ? styles.chevronOpen : styles.chevronClosed}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Read-only banner directly below the app header (rendered by TopBar.tsx),
 * listing which of the owner's courses are currently "in session" - purely
 * derived from each course's start/end/breaks dates via
 * src/lib/courses-in-session.ts (see that module for exactly what "in
 * session" means, including the missing-date and break-period edge cases).
 *
 * Read-only: no edit affordances, and course names are plain, non-clickable
 * chips - the app has no per-course deep link the Courses tab table can jump
 * to and TopBar itself is shared across routes that never mount that table,
 * so a "click to navigate" affordance here would have nowhere real to go.
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
 * the user before the real data arrives.
 */
export default function InSessionBanner() {
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

  if (!courses) return null;
  const inSession = coursesInSession(courses, new Date());
  if (inSession.length === 0) return null;

  return (
    <div className={styles.banner}>
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
            {inSession.map((course) => (
              <Chip
                key={course.id}
                label={course.name}
                size="small"
                sx={{
                  background: "var(--field-background)",
                  border: "1px solid var(--field-border)",
                  color: "var(--text-primary)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
