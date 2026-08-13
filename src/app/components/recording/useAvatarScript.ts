"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listAvatarCourseOptionsAction, generateAvatarScriptAction } from "@/app/actions";
// The purpose catalogue (values, labels, and the guidance text that actually
// steers the generated script) is owned by src/lib/avatar-video-purpose.ts -
// imported here rather than re-declared so the dropdown can never drift from
// what generateAvatarScriptAction's brief composer actually understands.
import { AVATAR_VIDEO_PURPOSES, type AvatarVideoPurpose } from "@/lib/avatar-video-purpose";

export interface AvatarCourseOption {
  id: string;
  label: string;
}

function readPersisted(key: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) ?? "";
}

export interface UseAvatarScriptReturn {
  // generation (F4) - course + purpose steering
  courseId: string;
  setCourseId: (value: string) => void;
  courses: AvatarCourseOption[];
  coursesError: string | null;
  purpose: AvatarVideoPurpose | "";
  setPurpose: (value: string) => void;

  // generation (F4)
  prompt: string;
  setPrompt: (value: string) => void;
  script: string;
  setScript: (value: string) => void;
  scriptBusy: boolean;
  scriptError: string | null;
  generateScript: () => Promise<void>;
}

/**
 * Script generation (F4): the prompt/script text, plus the course and
 * purpose steering that refines it - split out of useAvatarStudio.ts.
 */
export function useAvatarScript(): UseAvatarScriptReturn {
  // ---- generation (F4) ---------------------------------------------------
  const [prompt, setPrompt] = useState<string>(() => readPersisted("ta-rec-avatar-prompt"));
  const [script, setScript] = useState<string>(() => readPersisted("ta-rec-avatar-script"));
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-prompt", prompt);
  }, [prompt]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-script", script);
  }, [script]);

  // ---- course + purpose (F4 extension) -----------------------------------
  // Both refine the prompt above rather than replacing it, so they persist
  // the same way the prompt itself does. courseIdRaw/purposeRaw are the
  // literal persisted values; courseId/purpose (below) are the sanitized
  // values actually exposed to the panel and sent to the model, so a stale
  // or unrecognised persisted value never reaches either.
  const [courseIdRaw, setCourseIdRaw] = useState<string>(() => readPersisted("ta-rec-avatar-course"));
  const [purposeRaw, setPurposeRaw] = useState<string>(() => readPersisted("ta-rec-avatar-purpose"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-course", courseIdRaw);
  }, [courseIdRaw]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-purpose", purposeRaw);
  }, [purposeRaw]);

  const [courses, setCourses] = useState<AvatarCourseOption[]>([]);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [coursesLoaded, setCoursesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listAvatarCourseOptionsAction();
      if (cancelled) return;
      if ("error" in r) {
        setCoursesError(r.error);
        setCoursesLoaded(true);
        return;
      }
      setCourses(r.courses);
      setCoursesLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A persisted course id that no longer matches any loaded course - the
  // course was deleted, or this browser is now signed into a different
  // account than the one that set it - is treated as "no course" here,
  // never rendered as a selected value with no matching option (that is how
  // MUI blanks the control instead of showing the intended default). The
  // sanitized value is withheld as "" until the course list has actually
  // loaded, so the select never flashes a stale id before the real list
  // arrives either.
  const courseId = useMemo(() => {
    if (!coursesLoaded) return "";
    if (courseIdRaw && !courses.some((c) => c.id === courseIdRaw)) return "";
    return courseIdRaw;
  }, [coursesLoaded, courses, courseIdRaw]);

  // Same defensive treatment for purpose: a persisted value that no longer
  // appears in AVATAR_VIDEO_PURPOSES falls back to "no specific purpose"
  // rather than rendering a blanked select.
  const purpose = useMemo<AvatarVideoPurpose | "">(() => {
    if (!purposeRaw) return "";
    const match = AVATAR_VIDEO_PURPOSES.find((p) => p.value === purposeRaw);
    return match ? (match.value as AvatarVideoPurpose) : "";
  }, [purposeRaw]);

  const generateScript = useCallback(async () => {
    if (!prompt.trim()) return;
    setScriptBusy(true);
    setScriptError(null);
    try {
      const r = await generateAvatarScriptAction({
        prompt: prompt.trim(),
        courseId: courseId || null,
        purpose: purpose || null,
      });
      if ("error" in r) {
        setScriptError(r.error);
        return;
      }
      setScript(r.script);
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : "Could not generate a script.");
    } finally {
      setScriptBusy(false);
    }
  }, [prompt, courseId, purpose]);

  return {
    courseId,
    setCourseId: setCourseIdRaw,
    courses,
    coursesError,
    purpose,
    setPurpose: setPurposeRaw,

    prompt,
    setPrompt,
    script,
    setScript,
    scriptBusy,
    scriptError,
    generateScript,
  };
}
