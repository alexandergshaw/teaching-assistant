"use client";

// Progressive live load for the Success Tracking view (LIVE-LMS-STUDENT-
// MESSAGING W3). Lists the institution's active courses, then pulls each
// course's enrollments in its own server-action call, folding results into the
// table as they land (combineCourseResults). A failed course is partitioned,
// never fatal. All Canvas access is server-side (live-messaging-enrollments);
// this hook only imports TYPES from the aggregator so no Canvas code reaches
// the client bundle.

import { useEffect, useMemo, useState } from "react";
import {
  listLiveCoursesAction,
  loadCourseEnrollmentsAction,
} from "@/app/actions/live-messaging-enrollments";
import { combineCourseResults, failedCourseResult } from "@/lib/live-messaging/enrollment-load";
import type {
  AggregateResult,
  CourseStatus,
  EnrollmentRow,
  LiveCourse,
} from "@/lib/live-messaging/enrollment-aggregator";

interface LoadState {
  institution: string;
  listed: LiveCourse[];
  results: Record<string, AggregateResult>;
  listError: string | null;
}

export type LiveEnrollmentsStatus = "idle" | "loading-courses" | "loading" | "done" | "error";

export interface LiveEnrollments {
  status: LiveEnrollmentsStatus;
  rows: EnrollmentRow[];
  statuses: CourseStatus[];
  totalCourses: number;
  pending: number;
  failed: number;
  partial: number;
  listError: string | null;
  reload: () => void;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "The request failed.";
}

export function useLiveEnrollments(institution: string): LiveEnrollments {
  const [state, setState] = useState<LoadState | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!institution) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      let listed: Awaited<ReturnType<typeof listLiveCoursesAction>>;
      try {
        listed = await listLiveCoursesAction(institution);
      } catch (err) {
        listed = { error: messageOf(err) };
      }
      if (cancelled) return;
      if ("error" in listed) {
        setState({ institution, listed: [], results: {}, listError: listed.error });
        return;
      }
      setState({ institution, listed: listed.courses, results: {}, listError: null });
      for (const course of listed.courses) {
        let result: AggregateResult;
        try {
          const loaded = await loadCourseEnrollmentsAction(institution, course);
          result = "error" in loaded ? failedCourseResult(course, loaded.error) : loaded;
        } catch (err) {
          result = failedCourseResult(course, messageOf(err));
        }
        if (cancelled) return;
        setState((prev) =>
          prev && prev.institution === institution
            ? { ...prev, results: { ...prev.results, [course.id]: result } }
            : prev
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [institution, reloadToken]);

  const current = state && state.institution === institution ? state : null;

  return useMemo<LiveEnrollments>(() => {
    const reload = () => setReloadToken((n) => n + 1);
    if (!institution) {
      return { status: "idle", rows: [], statuses: [], totalCourses: 0, pending: 0, failed: 0, partial: 0, listError: null, reload };
    }
    if (!current) {
      return { status: "loading-courses", rows: [], statuses: [], totalCourses: 0, pending: 0, failed: 0, partial: 0, listError: null, reload };
    }
    const combined = combineCourseResults(current.listed, current.results);
    const status: LiveEnrollmentsStatus = current.listError
      ? "error"
      : combined.pending > 0
        ? "loading"
        : "done";
    return {
      status,
      rows: combined.rows,
      statuses: combined.statuses,
      totalCourses: current.listed.length,
      pending: combined.pending,
      failed: combined.failed,
      partial: combined.partial,
      listError: current.listError,
      reload,
    };
  }, [institution, current]);
}
