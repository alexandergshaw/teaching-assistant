"use client";

import { useEffect, useState } from "react";
import { listCoursesAction } from "../actions";
import type { CanvasCourse } from "@/lib/canvas";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import styles from "../page.module.css";

const SAVED_COURSES_KEY = "ta-canvas-saved-courses";

/** A Canvas course the user pinned so they can jump back into it. */
interface SavedCourse {
  id: string;
  url: string;
  name: string;
}

function readSavedCourses(): SavedCourse[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_COURSES_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is SavedCourse => !!c && typeof c.id === "string" && typeof c.url === "string")
      .map((c) => ({ id: c.id, url: c.url, name: typeof c.name === "string" && c.name ? c.name : `Course ${c.id}` }));
  } catch {
    return [];
  }
}

interface CoursePickerProps {
  /** Selected institution acronym; drives the course list. */
  activeInstitution: string;
  /** Current course URL (controlled by the parent). */
  courseUrl: string;
  /** The user typed in the paste-URL fallback. */
  onCourseUrlChange: (url: string) => void;
  /** The user chose a course (dropdown, saved pill, or Load button). */
  onSelect: (url: string) => void;
  /** Parent's load is in progress (drives the Load button state). */
  loading: boolean;
  /** Label for the Load button, e.g. "Load content". */
  loadLabel: string;
  /** Load error to surface under the picker. */
  loadError?: string | null;
  /** The loaded course's real name, used to keep a saved pill's label fresh. */
  courseName?: string;
}

/**
 * Course chooser shared by the Communications and Course Content tabs: a
 * dropdown of the institution's teacher courses, pinned-course pills (shared
 * across tabs via localStorage), and a paste-a-URL fallback. It only emits the
 * chosen course URL; the parent owns loading and what to do with it.
 */
export default function CoursePicker({
  activeInstitution,
  courseUrl,
  onCourseUrlChange,
  onSelect,
  loading,
  loadLabel,
  loadError,
  courseName,
}: CoursePickerProps) {
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [coursesState, setCoursesState] = useState<"idle" | "loading" | "error">(
    activeInstitution ? "loading" : "idle"
  );
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>(() => readSavedCourses());

  // Reset the course list to a loading state during render when the institution
  // changes, so the fetch effect below never calls setState synchronously.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setCourses([]);
    setCoursesState(activeInstitution ? "loading" : "idle");
  }

  // Reload the institution's courses (await-first so no synchronous setState).
  useEffect(() => {
    if (!activeInstitution) return;
    let cancelled = false;
    (async () => {
      const result = await listCoursesAction(activeInstitution);
      if (cancelled) return;
      if ("error" in result) {
        setCourses([]);
        setCoursesState("error");
        return;
      }
      setCourses(result.courses);
      setCoursesState("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [activeInstitution]);

  // Persist pinned courses to localStorage whenever they change (external sync).
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SAVED_COURSES_KEY, JSON.stringify(savedCourses));
    }
  }, [savedCourses]);

  const courseId = parseCanvasCourseId(courseUrl);
  const isSaved = !!courseId && savedCourses.some((c) => c.id === courseId);

  // Once the parent learns the course's real name, keep a saved pill's label
  // (and URL) fresh. Done during render — guarded so it runs once per change —
  // to avoid a setState-in-effect; the persistence effect above writes it through.
  const freshName = courseName;
  const syncKey = courseId && freshName ? `${courseId}:${freshName}` : "";
  const [syncedKey, setSyncedKey] = useState("");
  if (syncKey && syncKey !== syncedKey && courseId && freshName) {
    setSyncedKey(syncKey);
    setSavedCourses((prev) =>
      prev.some((c) => c.id === courseId)
        ? prev.map((c) => (c.id === courseId ? { ...c, name: freshName, url: courseUrl } : c))
        : prev
    );
  }

  const saveCurrentCourse = () => {
    if (!courseId || isSaved) return;
    setSavedCourses((prev) => [
      ...prev,
      { id: courseId, url: courseUrl.trim(), name: courseName || `Course ${courseId}` },
    ]);
  };

  const removeSavedCourse = (id: string) => {
    setSavedCourses((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <>
      <div className={styles.field}>
        <label htmlFor="course-picker">Course</label>
        <select
          id="course-picker"
          className={styles.textInput}
          value={courseId ?? ""}
          disabled={coursesState === "loading" || courses.length === 0}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onSelect(`/courses/${id}`);
          }}
        >
          <option value="">
            {coursesState === "loading"
              ? "Loading courses…"
              : courses.length === 0
                ? "No courses found"
                : "Select a course…"}
          </option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {coursesState === "error" && (
          <p className={styles.fieldHint}>
            Could not list courses for this school; paste a course URL below instead.
          </p>
        )}

        <details className={styles.generatedRubricCard} style={{ marginTop: 4 }}>
          <summary>Or paste a course URL</summary>
          <input
            id="course-url"
            type="url"
            className={styles.textInput}
            style={{ marginTop: 10 }}
            placeholder="Paste a course link (.../courses/123)"
            value={courseUrl}
            onChange={(e) => onCourseUrlChange(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button
              type="button"
              className={styles.downloadButton}
              onClick={() => onSelect(courseUrl.trim())}
              disabled={loading || !courseId}
            >
              {loading ? "Loading…" : loadLabel}
            </button>
            <button
              type="button"
              className={styles.downloadButton}
              onClick={saveCurrentCourse}
              disabled={!courseId || isSaved}
            >
              {isSaved ? "Saved" : "Save course"}
            </button>
          </div>
        </details>
        {loadError && <p className={styles.error}>{loadError}</p>}
      </div>

      {savedCourses.length > 0 && (
        <div className={styles.field}>
          <label>Saved courses</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {savedCourses.map((c) => (
              <span
                key={c.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 999,
                  border: "1px solid var(--field-border)",
                  background: "var(--field-background)",
                  paddingLeft: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.url)}
                  style={{
                    font: "inherit",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    background: "transparent",
                    border: "none",
                    borderRadius: 999,
                    padding: "5px 8px",
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  title="Remove"
                  onClick={() => removeSavedCourse(c.id)}
                  style={{
                    font: "inherit",
                    fontSize: "1rem",
                    lineHeight: 1,
                    color: "var(--text-secondary)",
                    background: "transparent",
                    border: "none",
                    borderRadius: 999,
                    padding: "4px 9px 4px 2px",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
