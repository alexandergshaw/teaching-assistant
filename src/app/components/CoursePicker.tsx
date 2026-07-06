"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { listCoursesAction } from "../actions";
import type { CanvasCourse } from "@/lib/canvas";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import Typeahead from "./ui/Typeahead";
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
  /** The user chose a course (dropdown or saved pill). */
  onSelect: (url: string) => void;
  /** Load error to surface under the picker. */
  loadError?: string | null;
  /** The loaded course's real name, used to keep a saved pill's label fresh. */
  courseName?: string;
}

/**
 * Course chooser shared by the Communications and Course Content tabs: a
 * dropdown of the institution's teacher courses and pinned-course pills (shared
 * across tabs via localStorage). It only emits the chosen course URL; the parent
 * owns loading and what to do with it.
 */
export default function CoursePicker({
  activeInstitution,
  courseUrl,
  onSelect,
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
        <label>Course</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <Typeahead
              options={courses.map((c) => ({ value: c.id, label: c.name }))}
              value={courseId ?? ""}
              onChange={(id) => { if (id) onSelect(`/courses/${id}`); }}
              placeholder={coursesState === "loading" ? "Loading courses..." : courses.length === 0 ? "No courses found" : "Select a course..."}
              disabled={coursesState === "loading" || courses.length === 0}
              loading={coursesState === "loading"}
              noOptionsText="No courses found"
            />
          </div>
          <Button
            variant="outlined"
            size="small"
            onClick={saveCurrentCourse}
            disabled={!courseId || isSaved}
          >
            {isSaved ? "Saved" : "Save course"}
          </Button>
        </div>
        {coursesState === "error" && (
          <p className={styles.fieldHint}>Could not list courses for this school.</p>
        )}
        {loadError && <p className={styles.error}>{loadError}</p>}
      </div>

      {savedCourses.length > 0 && (
        <div className={styles.field}>
          <label>Saved courses</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {savedCourses.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                onClick={() => onSelect(c.url)}
                onDelete={() => removeSavedCourse(c.id)}
                size="small"
                sx={{ maxWidth: 260 }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
