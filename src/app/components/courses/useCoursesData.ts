"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listCourseHubAction,
  listFinalizedSyllabiAction,
  listMyOrgsAction,
  getCourseNotificationsAction,
  listGithubReposAction,
} from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";

export interface UseCoursesDataReturn {
  courses: Course[];
  setCourses: (courses: Course[] | ((prev: Course[]) => Course[])) => void;
  syllabi: FinalizedSyllabusMeta[];
  setSyllabi: (syllabi: FinalizedSyllabusMeta[] | ((prev: FinalizedSyllabusMeta[]) => FinalizedSyllabusMeta[])) => void;
  orgs: string[];
  setOrgs: (orgs: string[] | ((prev: string[]) => string[])) => void;
  state: "loading" | "idle" | "error";
  refreshing: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  load: (opts?: { silent?: boolean }) => Promise<void>;
  reloadSyllabi: () => Promise<void>;
  notifByCourse: Record<string, { needsGrading: number; unread: number }>;
  ownedRepos: string[] | null;
}

let hubCache: { courses: Course[]; syllabi: FinalizedSyllabusMeta[]; orgs: string[] } | null = null;

export function useCoursesData(): UseCoursesDataReturn {
  const [courses, setCourses] = useState<Course[]>(() => hubCache?.courses ?? []);
  const [syllabi, setSyllabi] = useState<FinalizedSyllabusMeta[]>(() => hubCache?.syllabi ?? []);
  const [orgs, setOrgs] = useState<string[]>(() => hubCache?.orgs ?? []);
  const [state, setState] = useState<"loading" | "idle" | "error">(hubCache ? "idle" : "loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifByCourse, setNotifByCourse] = useState<Record<string, { needsGrading: number; unread: number }>>({});
  const [ownedRepos, setOwnedRepos] = useState<string[] | null>(null);

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

  const setOrgsWithCache = useCallback((u: string[] | ((prev: string[]) => string[])): void => {
    setOrgs((prev) => {
      const next = typeof u === "function" ? u(prev) : u;
      if (hubCache) hubCache = { ...hubCache, orgs: next };
      return next;
    });
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setState("loading");
    const [c, s, o] = await Promise.all([listCourseHubAction(), listFinalizedSyllabiAction(), listMyOrgsAction()]);
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
    };
    hubCache = next;
    setCoursesWithCache(next.courses);
    setSyllabisWithCache(next.syllabi);
    setOrgsWithCache(next.orgs);
    setState("idle");
    setRefreshing(false);
  }, [setCoursesWithCache, setSyllabisWithCache, setOrgsWithCache]);

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
    const targets = courses.filter((c) => c.canvasUrl && c.institution);
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        targets.map(async (c) => [c.id, await getCourseNotificationsAction(c.canvasUrl as string, c.institution as string)] as const)
      );
      if (cancelled) return;
      const map: Record<string, { needsGrading: number; unread: number }> = {};
      for (const [id, r] of entries) if (!("error" in r)) map[id] = r;
      setNotifByCourse(map);
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
    orgs,
    setOrgs: setOrgsWithCache,
    state,
    refreshing,
    error,
    setError,
    load,
    reloadSyllabi,
    notifByCourse,
    ownedRepos,
  };
}
