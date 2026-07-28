"use client";

// Persisted setup state for Live Class Mode: the course tile, the optional
// module within it, the microphone, the transcription-path override, and the
// room-audio DSP toggles. Every control persists under its OWN "ta-live-*"
// keys (never the "ta-rec-*" keys the Recording tab owns - see C6) so a
// reload during a live class does not lose the instructor's setup.
//
// C6: noiseSuppression/echoCancellation/autoGain default OFF here (the
// Recording tab's useRecordingSettings defaults them ON, tuned for one
// presenter close to the mic - wrong for a student speaking from across the
// room).

import { useEffect, useState } from "react";
import { listCourseHubAction } from "@/app/actions";
import { listCourseContentAction } from "@/app/actions";
import { liveModuleValue } from "@/lib/workflows/module-value";
import type { LiveCourseOption, LiveModuleOption, TranscriptionOverride } from "./types";

const COURSE_KEY = "ta-live-course";
const MODULE_KEY = "ta-live-module";
const MIC_KEY = "ta-live-mic";
const TRANSCRIPTION_MODE_KEY = "ta-live-transcription-mode";
const NOISE_KEY = "ta-live-noise";
const ECHO_KEY = "ta-live-echo";
const GAIN_KEY = "ta-live-gain";

function readString(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}

export interface UseLiveClassSettingsReturn {
  courseId: string;
  setCourseId: (id: string) => void;
  moduleValue: string;
  setModuleValue: (value: string) => void;
  micId: string;
  setMicId: (id: string) => void;
  transcriptionOverride: TranscriptionOverride;
  setTranscriptionOverride: (value: TranscriptionOverride) => void;
  noiseSuppression: boolean;
  setNoiseSuppression: (value: boolean) => void;
  echoCancellation: boolean;
  setEchoCancellation: (value: boolean) => void;
  autoGain: boolean;
  setAutoGain: (value: boolean) => void;

  courses: LiveCourseOption[] | null;
  coursesError: string | null;
  moduleOptions: LiveModuleOption[];
  moduleOptionsError: string | null;
  modulesSupported: boolean;
}

export function useLiveClassSettings(): UseLiveClassSettingsReturn {
  const [courseId, setCourseIdState] = useState(() => readString(COURSE_KEY, ""));
  const [moduleValue, setModuleValueState] = useState(() => readString(MODULE_KEY, ""));
  const [micId, setMicIdState] = useState(() => readString(MIC_KEY, ""));
  const [transcriptionOverride, setTranscriptionOverrideState] = useState<TranscriptionOverride>(() => {
    const saved = readString(TRANSCRIPTION_MODE_KEY, "auto");
    return saved === "web-speech" || saved === "segmented" ? saved : "auto";
  });
  const [noiseSuppression, setNoiseSuppressionState] = useState(() => readBool(NOISE_KEY, false));
  const [echoCancellation, setEchoCancellationState] = useState(() => readBool(ECHO_KEY, false));
  const [autoGain, setAutoGainState] = useState(() => readBool(GAIN_KEY, false));

  const setCourseId = (id: string) => {
    setCourseIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(COURSE_KEY, id);
    // A module picked under the previous course never carries over.
    setModuleValueState("");
    if (typeof window !== "undefined") localStorage.setItem(MODULE_KEY, "");
  };
  const setModuleValue = (value: string) => {
    setModuleValueState(value);
    if (typeof window !== "undefined") localStorage.setItem(MODULE_KEY, value);
  };
  const setMicId = (id: string) => {
    setMicIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(MIC_KEY, id);
  };
  const setTranscriptionOverride = (value: TranscriptionOverride) => {
    setTranscriptionOverrideState(value);
    if (typeof window !== "undefined") localStorage.setItem(TRANSCRIPTION_MODE_KEY, value);
  };
  const setNoiseSuppression = (value: boolean) => {
    setNoiseSuppressionState(value);
    if (typeof window !== "undefined") localStorage.setItem(NOISE_KEY, value ? "1" : "0");
  };
  const setEchoCancellation = (value: boolean) => {
    setEchoCancellationState(value);
    if (typeof window !== "undefined") localStorage.setItem(ECHO_KEY, value ? "1" : "0");
  };
  const setAutoGain = (value: boolean) => {
    setAutoGainState(value);
    if (typeof window !== "undefined") localStorage.setItem(GAIN_KEY, value ? "1" : "0");
  };

  // Course tiles, loaded once.
  const [courses, setCourses] = useState<LiveCourseOption[] | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listCourseHubAction();
        if (cancelled) return;
        if ("error" in result) {
          setCoursesError(result.error);
          return;
        }
        setCourses(result.courses.map((c) => ({ id: c.id, name: c.name, canvasUrl: c.canvasUrl ?? null })));
        setCoursesError(null);
      } catch (err) {
        if (!cancelled) setCoursesError(err instanceof Error ? err.message : "Could not load courses.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Modules for the selected course, from the live LMS only - a course tile
  // with no Canvas connection simply offers no modules, and the session
  // still works fine at course level (buildLiveSessionContextAction gathers
  // course-level material when moduleIdRaw is blank).
  const [moduleOptions, setModuleOptions] = useState<LiveModuleOption[]>([]);
  const [moduleOptionsError, setModuleOptionsError] = useState<string | null>(null);
  const selectedCourse = courses?.find((c) => c.id === courseId) ?? null;
  const canvasUrl = selectedCourse?.canvasUrl ?? null;
  const modulesSupported = Boolean(canvasUrl);

  // Reset the previous course's module list synchronously during render when
  // canvasUrl changes - the documented React pattern for "adjusting state
  // when a prop changes" (and the same idiom this codebase already uses for
  // the analogous case in useWorkflowOptions.ts's lmsModuleOptions), rather
  // than an effect whose only job would be calling setState directly.
  const [resetForCanvasUrl, setResetForCanvasUrl] = useState(canvasUrl);
  if (canvasUrl !== resetForCanvasUrl) {
    setResetForCanvasUrl(canvasUrl);
    setModuleOptions([]);
    setModuleOptionsError(null);
  }

  useEffect(() => {
    if (!canvasUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await listCourseContentAction(canvasUrl);
        if (cancelled) return;
        if ("error" in result) {
          setModuleOptionsError(result.error);
          setModuleOptions([]);
          return;
        }
        setModuleOptions(result.modules.map((m) => ({ value: liveModuleValue(m.id, m.name), label: m.name })));
        setModuleOptionsError(null);
      } catch (err) {
        if (!cancelled) {
          setModuleOptionsError(err instanceof Error ? err.message : "Could not load modules.");
          setModuleOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canvasUrl]);

  return {
    courseId,
    setCourseId,
    moduleValue,
    setModuleValue,
    micId,
    setMicId,
    transcriptionOverride,
    setTranscriptionOverride,
    noiseSuppression,
    setNoiseSuppression,
    echoCancellation,
    setEchoCancellation,
    autoGain,
    setAutoGain,
    courses,
    coursesError,
    moduleOptions,
    moduleOptionsError,
    modulesSupported,
  };
}
