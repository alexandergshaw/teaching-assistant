"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { listCoursesAction } from "../actions";
import type { CanvasCourse } from "@/lib/canvas";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { readCachedSelectorLabel, writeCachedSelectorLabel, resolveSelectorLabel } from "@/lib/course-selector-labels";
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
      .map((c) => {
        // A name written by a version of this component before the label
        // cache existed (or a name missing outright from malformed storage)
        // fell back to the literal id - exactly the bug this cache fixes.
        // Treat that fallback as "no name known" so a stale pill picks up a
        // real name from the cache instead of repeating the id forever.
        const stored = typeof c.name === "string" ? c.name.trim() : "";
        const isStaleIdFallback = stored === `Course ${c.id}`;
        const known = stored && !isStaleIdFallback ? stored : readCachedSelectorLabel("lmsCourse", c.id);
        return { id: c.id, url: c.url, name: resolveSelectorLabel({ id: c.id, optionLabel: known }) };
      });
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
      // The list just loaded with real names - cache all of them (not just
      // whatever happens to be selected right now) so a course id restored
      // from localStorage elsewhere has a name ready before its own list
      // reloads. See src/lib/course-selector-labels.ts.
      for (const course of result.courses) {
        writeCachedSelectorLabel("lmsCourse", course.id, course.name);
      }
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

  // The best name currently known for the selected course: the loaded
  // options list (freshest - covers the common case where this component's
  // own fetch resolved it) or the courseName prop (some callers, like
  // ContentTab, separately know the active course's name before - or
  // without - this component's own list finishing). Neither is "the
  // cache" - see the useState below, which resolves against that too.
  const knownCourseName =
    courses.find((c) => c.id === courseId)?.name ||
    (courseName && courseName.trim()) ||
    "";

  // Once a real name is known (from the options list OR the courseName
  // prop), keep a saved pill's label (and URL) fresh, and refresh the
  // shared label cache so a reload shows this name immediately even before
  // the options list (or courseName) is available again. Done during
  // render - guarded so it runs once per change - to avoid a
  // setState-in-effect; the persistence effect above writes it through.
  const syncKey = courseId && knownCourseName ? `${courseId}:${knownCourseName}` : "";
  const [syncedKey, setSyncedKey] = useState("");
  if (syncKey && syncKey !== syncedKey && courseId && knownCourseName) {
    setSyncedKey(syncKey);
    writeCachedSelectorLabel("lmsCourse", courseId, knownCourseName);
    setSavedCourses((prev) =>
      prev.some((c) => c.id === courseId)
        ? prev.map((c) => (c.id === courseId ? { ...c, name: knownCourseName, url: courseUrl } : c))
        : prev
    );
  }

  const saveCurrentCourse = () => {
    if (!courseId || isSaved) return;
    const label = resolveSelectorLabel({
      id: courseId,
      optionLabel: knownCourseName || undefined,
      cachedLabel: readCachedSelectorLabel("lmsCourse", courseId),
    });
    setSavedCourses((prev) => [
      ...prev,
      { id: courseId, url: courseUrl.trim(), name: label },
    ]);
  };

  const removeSavedCourse = (id: string) => {
    setSavedCourses((prev) => prev.filter((c) => c.id !== id));
  };

  // Typeahead resolves its displayed value by matching `options` against the
  // current id (see ui/Typeahead.tsx) - if the loaded `courses` list doesn't
  // (yet, or ever) contain the restored courseId, that match fails and the
  // box renders blank rather than a name. Append a synthetic option carrying
  // the best name this component or the shared cache knows, so the box
  // always has something to resolve to. Its `value` is still the real
  // courseId - selecting it again submits the exact same id as before.
  const typeaheadOptions =
    courseId && !courses.some((c) => c.id === courseId)
      ? [
          ...courses.map((c) => ({ value: c.id, label: c.name })),
          {
            value: courseId,
            label: resolveSelectorLabel({
              id: courseId,
              optionLabel: knownCourseName || undefined,
              cachedLabel: readCachedSelectorLabel("lmsCourse", courseId),
            }),
          },
        ]
      : courses.map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <div className={styles.field}>
        <label>Course</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <Typeahead
              options={typeaheadOptions}
              value={courseId ?? ""}
              onChange={(id) => {
                if (!id) return;
                // The moment the user picks a course from a LOADED list, its
                // name is known for certain - cache it so a later reload can
                // show the name immediately instead of the raw id.
                const pickedName = courses.find((c) => c.id === id)?.name;
                if (pickedName) writeCachedSelectorLabel("lmsCourse", id, pickedName);
                onSelect(`/courses/${id}`);
              }}
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
