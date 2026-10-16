"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  listCourseHubAction,
  listCourseHubLightAction,
  listFinalizedSyllabiAction,
  listMyOrgsAction,
  listSyllabusTemplatesAction,
  getCourseNotificationsAction,
  listGithubReposAction,
  getGoogleCalendarStatusAction,
} from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import type { SyllabusTemplateMeta } from "@/lib/supabase/syllabus-templates";
import { splitCourseNotifResults } from "@/lib/courses-table-helpers";
import { mergeHydratedCourses } from "@/lib/courses-hydration";
import { registerOwnerScopedCache } from "@/lib/workflows/run-form-options-cache";

export interface UseCoursesDataReturn {
  courses: Course[];
  setCourses: (courses: Course[] | ((prev: Course[]) => Course[])) => void;
  syllabi: FinalizedSyllabusMeta[];
  setSyllabi: (syllabi: FinalizedSyllabusMeta[] | ((prev: FinalizedSyllabusMeta[]) => FinalizedSyllabusMeta[])) => void;
  templates: SyllabusTemplateMeta[];
  setTemplates: (templates: SyllabusTemplateMeta[] | ((prev: SyllabusTemplateMeta[]) => SyllabusTemplateMeta[])) => void;
  orgs: string[];
  setOrgs: (orgs: string[] | ((prev: string[]) => string[])) => void;
  state: "loading" | "idle" | "error";
  refreshing: boolean;
  /** False between the light first paint and the background merge of the
   * heavy content columns; true once every Course field is real. */
  heavyReady: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  load: (opts?: { silent?: boolean }) => Promise<void>;
  reloadSyllabi: () => Promise<void>;
  notifByCourse: Record<string, { needsGrading: number; unread: number }>;
  /** F2: the SAME per-course live Canvas check as notifByCourse, but the
   * error branch - "Set this course's institution to load notifications.",
   * "Course URL must look like .../courses/123." - instead of the ok one.
   * Previously discarded entirely (see splitCourseNotifResults's own doc
   * comment); kept here, keyed by course id, so LmsCell's connection-status
   * pill can report a live failure instead of rendering identically to a
   * healthy course. */
  lmsErrorByCourse: Record<string, string>;
  ownedRepos: string[] | null;
  /** null while the one-time connection check (below) is still in flight -
   * see courseCalendarBlockers's own doc comment for why that reads as "not
   * blocked" rather than a false-positive "not connected" flash. Checked
   * ONCE per page load here (not per course row) since Google Calendar
   * connection is a per-USER setting, not a per-course one - AC9. */
  googleCalendarConnected: boolean | null;
}

let hubCache: { courses: Course[]; syllabi: FinalizedSyllabusMeta[]; templates: SyllabusTemplateMeta[]; orgs: string[] } | null = null;
let hubCacheGeneration = 0;

// OWNERSHIP - this module-scope cache survives a client-side sign-out the
// same way run-form-options-cache.ts's own Map and useCourseTasksData.ts's
// hubCache do (regression entry 189): TopBar.tsx's sign-out never tears down
// the JS module registry on its own, so without this, user B signing in in
// the same tab would mount straight from user A's cached course tiles/
// syllabi/templates/orgs for one round trip. Registered with
// run-form-options-cache.ts's setCacheOwner chokepoint rather than a second,
// parallel invalidation scheme. Called once, at module scope - never from
// inside the hook body below, since this repo's react-hooks/globals lint
// rule rejects a module-level reassignment reached from a component/hook's
// render body.
registerOwnerScopedCache(() => {
  hubCache = null;
  hubCacheGeneration++;
});

export function useCoursesData(): UseCoursesDataReturn {
  const [courses, setCourses] = useState<Course[]>(() => hubCache?.courses ?? []);
  const [syllabi, setSyllabi] = useState<FinalizedSyllabusMeta[]>(() => hubCache?.syllabi ?? []);
  const [templates, setTemplates] = useState<SyllabusTemplateMeta[]>(() => hubCache?.templates ?? []);
  const [orgs, setOrgs] = useState<string[]>(() => hubCache?.orgs ?? []);
  const [state, setState] = useState<"loading" | "idle" | "error">(hubCache ? "idle" : "loading");
  const [refreshing, setRefreshing] = useState(false);
  const [heavyReady, setHeavyReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifByCourse, setNotifByCourse] = useState<Record<string, { needsGrading: number; unread: number }>>({});
  const [lmsErrorByCourse, setLmsErrorByCourse] = useState<Record<string, string>>({});
  const [ownedRepos, setOwnedRepos] = useState<string[] | null>(null);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState<boolean | null>(null);
  const loadSequenceRef = useRef(0);

  const setCoursesWithCache = useCallback((u: Course[] | ((prev: Course[]) => Course[])): void => {
    setCourses((prev) => {
      const next = typeof u === "function" ? u(prev) : u;
      if (hubCache) hubCache = { ...hubCache, courses: next };
      return next;
    });
  }, []);

  const setSyllabisWithCache = useCallback((u: FinalizedSyllabusMeta[] | ((prev: FinalizedSyllabusMeta[]) => FinalizedSyllabusMeta[])): void => {
    setSyllabi((prev) => {
      const next = typeof u === "function" ? u(prev) : u;
      if (hubCache) hubCache = { ...hubCache, syllabi: next };
      return next;
    });
  }, []);

  const setTemplatesWithCache = useCallback((u: SyllabusTemplateMeta[] | ((prev: SyllabusTemplateMeta[]) => SyllabusTemplateMeta[])): void => {
    setTemplates((prev) => {
      const next = typeof u === "function" ? u(prev) : u;
      if (hubCache) hubCache = { ...hubCache, templates: next };
      return next;
    });
  }, []);

  const setOrgsWithCache = useCallback((u: string[] | ((prev: string[]) => string[])): void => {
    setOrgs((prev) => {
      const next = typeof u === "function" ? u(prev) : u;
      if (hubCache) hubCache = { ...hubCache, orgs: next };
      return next;
    });
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const loadSequence = ++loadSequenceRef.current;
    const cacheGeneration = hubCacheGeneration;
    const isCurrentLoad = () => loadSequence === loadSequenceRef.current && cacheGeneration === hubCacheGeneration;
    if (opts?.silent) setRefreshing(true);
    else setState("loading");
    // A silent reload already has rows on screen, so it fetches full rows in
    // one step (a light replace would blank the heavy cells). Only the
    // initial, non-silent load paints from the light rows first.
    const twoPhase = !opts?.silent;
    if (twoPhase) {
      // These lookups are needed to label some cells and populate later forms,
      // but they must not hold the first cold table paint. In particular, the
      // org lookup can make several sequential GitHub requests. Start the
      // supporting work beside the light course query and publish its rows as
      // soon as that query returns.
      const auxiliaryPromise = Promise.all([
        listFinalizedSyllabiAction(),
        listMyOrgsAction(),
        listSyllabusTemplatesAction(),
      ]);
      const c = await listCourseHubLightAction();
      if (!isCurrentLoad()) return;
      if ("error" in c) {
        setRefreshing(false);
        setState("error");
        setError(c.error);
        return;
      }

      // Show course rows before waiting for auxiliary metadata or full rows.
      // Row actions stay inert until the complete records are merged below.
      setHeavyReady(false);
      setCourses(c.courses);
      setState("idle");
      setRefreshing(false);
      const fullPromise = listCourseHubAction();

      const [s, o, t] = await auxiliaryPromise;
      if (!isCurrentLoad()) return;
      const syllabi = "error" in s ? [] : s.syllabi;
      const orgs = "error" in o ? [] : o.orgs;
      const templates = "error" in t ? [] : t.templates;
      setSyllabi(syllabi);
      setOrgs(orgs);
      setTemplates(templates);

      const full = await fullPromise;
      if (!isCurrentLoad()) return;
      if ("error" in full) {
        setError(`Could not load the full course details: ${full.error} Use Refresh to retry.`);
        return;
      }
      const merged = mergeHydratedCourses(c.courses, full.courses);
      hubCache = { courses: merged, syllabi, orgs, templates };
      setCoursesWithCache(merged);
      setHeavyReady(true);
      return;
    }

    const [c, s, o, t] = await Promise.all([
      listCourseHubAction(),
      listFinalizedSyllabiAction(),
      listMyOrgsAction(),
      listSyllabusTemplatesAction(),
    ]);
    if (!isCurrentLoad()) return;
    if ("error" in c) {
      setRefreshing(false);
      if (!opts?.silent) {
        setState("error");
        setError(c.error);
      }
      return;
    }
    const next = {
      courses: c.courses,
      syllabi: "error" in s ? [] : s.syllabi,
      orgs: "error" in o ? [] : o.orgs,
      templates: "error" in t ? [] : t.templates,
    };
    hubCache = next;
    setCoursesWithCache(next.courses);
    setSyllabisWithCache(next.syllabi);
    setOrgsWithCache(next.orgs);
    setTemplatesWithCache(next.templates);
    setHeavyReady(true);
    setState("idle");
    setRefreshing(false);
  }, [setCoursesWithCache, setSyllabisWithCache, setOrgsWithCache, setTemplatesWithCache]);

  const reloadSyllabi = useCallback(async () => {
    const s = await listFinalizedSyllabiAction();
    if (!("error" in s)) {
      setSyllabisWithCache(s.syllabi);
    }
  }, [setSyllabisWithCache]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load({ silent: hubCache != null });
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listGithubReposAction();
      if (cancelled) return;
      if (!("error" in r)) {
        const sorted = r.repos.map((repo) => repo.fullName).sort();
        setOwnedRepos(sorted);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getGoogleCalendarStatusAction();
      if (cancelled) return;
      if (!("error" in r)) setGoogleCalendarConnected(r.connected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const targets = courses.filter((c) => c.canvasUrl && c.institution);
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        targets.map(async (c) => [c.id, await getCourseNotificationsAction(c.canvasUrl as string, c.institution as string)] as const)
      );
      if (cancelled) return;
      // F2: previously discarded every error branch entirely
      // (`if (!("error" in r)) map[id] = r;`) - splitCourseNotifResults keeps
      // both halves, so a course whose live check FAILED is distinguishable
      // from one that simply has not been checked yet.
      const { ok, errors } = splitCourseNotifResults(entries);
      setNotifByCourse(ok);
      setLmsErrorByCourse(errors);
    })();
    return () => {
      cancelled = true;
    };
  }, [courses]);

  return {
    courses,
    setCourses: setCoursesWithCache,
    syllabi,
    setSyllabi: setSyllabisWithCache,
    templates,
    setTemplates: setTemplatesWithCache,
    orgs,
    setOrgs: setOrgsWithCache,
    state,
    refreshing,
    heavyReady,
    error,
    setError,
    load,
    reloadSyllabi,
    notifByCourse,
    lmsErrorByCourse,
    ownedRepos,
    googleCalendarConnected,
  };
}
