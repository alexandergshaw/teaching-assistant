"use client";

// Setup state for the walkthrough-announcement panel (course, module label,
// notes, the two format toggles, and the loaded course list), extracted from
// WalkthroughAnnouncementPanel.tsx so the panel stays under the 1000-line
// ceiling. Behavior is unchanged - every effect, seed and persist call moved
// verbatim.

import { useCallback, useEffect, useState } from "react";
import { listCourseHubAction } from "@/app/actions";
import type { WtaCourseOption } from "./AnnouncementCourseFieldset";
import { courseToAutoSelect } from "./walkthrough-run-decisions";

// PERSISTED CONTROLS (AC1/AC3) - a bound const per key, mirroring
// ModuleDeckCapturePanel.tsx's own STORAGE_KEY_* idiom, so the directory's
// ordinal ta- key canary (walkthrough-announcement.structure.test.ts) can
// find them without re-typing the literal. "walkannounce" is this feature's
// own RecordingLaunch view id (recording-launch.ts). This surface's own key
// segment ("wta") is reserved and distinct from module-deck-capture's own
// segment and every other recording surface's own keys - deliberately not
// spelled out as a second literal here, so this comment cannot itself be
// miscounted by the directory-wide key-ordinal canary below.
const STORAGE_KEY_COURSE = "ta-rec-wta-course";
const STORAGE_KEY_MODULE = "ta-rec-wta-module";
const STORAGE_KEY_NOTES = "ta-rec-wta-notes";
// G3 Ruling 4/G: two new persisted format toggles.
const STORAGE_KEY_EMOJI = "ta-rec-wta-emoji";
const STORAGE_KEY_RESOURCES = "ta-rec-wta-resources";

export const MAX_NOTES_CHARS = 2000;

export function useWalkthroughSetup(active: boolean) {
  // --- Course (AC1's own course key, and the destination for AC7's post) --

  const [courses, setCourses] = useState<WtaCourseOption[] | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  // G6: .trim() is load-bearing. A whitespace-only stored value is TRUTHY, so it
  // would pass the `if (!courseId)` guards below and reach both exemplar
  // actions, whose `!courseId.trim()` arms return an empty SUCCESS before
  // querying. Full rationale: REGRESSION 419 and this directory's structure test.
  const [courseId, setCourseId] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY_COURSE) ?? "").trim()
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_COURSE, courseId);
    } catch {
      // Best-effort, mirrors every sibling recording panel's own low-stakes
      // course-id persistence - losing this does not affect the session.
    }
  }, [courseId]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await listCourseHubAction();
        if (cancelled) return;
        if ("error" in result) {
          setCoursesError(result.error);
          return;
        }
        const loaded = result.courses
          .filter((c) => Boolean(c.canvasUrl))
          .map((c) => ({ id: c.id, name: c.name, canvasUrl: c.canvasUrl as string, institution: c.institution ?? null }));
        setCourses(loaded);
        setCoursesError(null);
        // F3: a never-written course with exactly one Canvas-linked course
        // selects it. Updater form reads the LATEST value (a pick made while
        // the list loaded wins); courseToAutoSelect never changes a persisted
        // choice, so a null result keeps prev.
        setCourseId((prev) => courseToAutoSelect(loaded, prev || null) ?? prev);
      } catch (err) {
        if (!cancelled) setCoursesError(err instanceof Error ? err.message : "Could not load your courses.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const [moduleLabel, setModuleLabel] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY_MODULE) ?? "")
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_MODULE, moduleLabel);
    } catch {
      // Best-effort.
    }
  }, [moduleLabel]);

  const [notesText, setNotesTextState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (window.localStorage.getItem(STORAGE_KEY_NOTES) ?? "").slice(0, MAX_NOTES_CHARS);
  });
  const setNotesText = useCallback((next: string) => setNotesTextState(next.slice(0, MAX_NOTES_CHARS)), []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_NOTES, notesText);
    } catch {
      // Best-effort - a lost notes box degrades the next draft's context,
      // it does not lose anything already captured or drafted.
    }
  }, [notesText]);

  // G3 Ruling 4/G: emoji and resource-research toggles, persisted. Unlike
  // courseId/moduleLabel/notesText above, these are BOOLEANS rendered as a
  // checked/unchecked control - a localStorage-seeded useState initializer
  // does not show its restored value on reload on an SSR'd surface (the
  // server-rendered markup always reflects the default, and a lazy
  // initializer reading localStorage on the client's first render disagrees
  // with it), so restoration happens in a mount effect instead
  // (persisted-details-open-hydration.md's own fix shape).
  const [emojiOn, setEmojiOn] = useState(false);
  const [researchOn, setResearchOn] = useState(false);
  useEffect(() => {
    // setState-in-effect idiom (AGENTS.md/CLAUDE.md guidance, this repo's own
    // useCourseIntel.ts precedent): every setState below is reached only
    // after an await, never synchronously from the effect body - eslint's
    // react-hooks/set-state-in-effect rejects the latter.
    void (async () => {
      await Promise.resolve();
      try {
        const storedEmoji = window.localStorage.getItem(STORAGE_KEY_EMOJI);
        if (storedEmoji !== null) setEmojiOn(storedEmoji === "true");
        const storedResearch = window.localStorage.getItem(STORAGE_KEY_RESOURCES);
        if (storedResearch !== null) setResearchOn(storedResearch === "true");
      } catch {
        // Best-effort - falls back to the defaults above.
      }
    })();
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_EMOJI, String(emojiOn));
    } catch {
      // Best-effort.
    }
  }, [emojiOn]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_RESOURCES, String(researchOn));
    } catch {
      // Best-effort.
    }
  }, [researchOn]);

  const selectedCourse = (courses ?? []).find((c) => c.id === courseId) ?? null;

  return {
    courses,
    coursesError,
    courseId,
    setCourseId,
    moduleLabel,
    setModuleLabel,
    notesText,
    setNotesText,
    emojiOn,
    setEmojiOn,
    researchOn,
    setResearchOn,
    selectedCourse,
  };
}
