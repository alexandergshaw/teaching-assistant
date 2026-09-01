"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { listCoursesAction, listCourseHubAction } from "../actions";
import type { CanvasCourse } from "@/lib/canvas";
import type { Course } from "@/lib/supabase/courses";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { describeExportSectionState, describeNoInstitutionSelected } from "@/lib/course-picker-availability";
import { readCachedSelectorLabel, writeCachedSelectorLabel, resolveSelectorLabel } from "@/lib/course-selector-labels";
import Typeahead from "./ui/Typeahead";
import { ImportCourseExportControl } from "./content-tab/ImportCourseExportControl";
import styles from "../page.module.css";
import tableStyles from "./courses/CoursesTable.module.css";

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
  /** Also offer course_hub rows that have a stored LMS export, in a clearly
   * separated section below the live Canvas dropdown - additive, so every
   * OTHER caller of this shared picker (which all omit this prop) renders
   * exactly as it did before this feature. Only the Course Content tab
   * passes it, since reading a stored export is that tab's job
   * (src/lib/lms-export-source). Institution-agnostic on purpose: reading an
   * export needs no Canvas credential, so unlike the live list above, this
   * one is not scoped to `activeInstitution`. See lmsRenderSourcesFor
   * (src/lib/courses-table-helpers.ts) for which courses qualify - a course
   * with BOTH a live connection and a stored export appears in both
   * sections, so the instructor can explicitly pick either one. */
  showExportCourses?: boolean;
  /** The export course_hub row id currently selected, if the active
   * selection is export-sourced - highlights its chip the same way the
   * Typeahead above already highlights the live selection via `courseUrl`.
   * Ignored when `showExportCourses` is false. */
  selectedExportCourseId?: string | null;
  /** The user picked a course from the export section: its course_hub row
   * id, NOT a Canvas URL (an export-only course may have no Canvas URL at
   * all, which is the entire reason this section exists). Required when
   * `showExportCourses` is true. */
  onSelectExport?: (courseId: string) => void;
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
  showExportCourses = false,
  selectedExportCourseId = null,
  onSelectExport,
}: CoursePickerProps) {
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [coursesState, setCoursesState] = useState<"idle" | "loading" | "error">(
    activeInstitution ? "loading" : "idle"
  );
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>(() => readSavedCourses());
  // Raw course_hub rows, NOT pre-filtered - describeExportSectionState needs
  // every row (not just the ones that qualify) to tell "no course has any
  // export" apart from "every export is app-generated" (AC5). See
  // src/lib/course-picker-availability.ts.
  const [exportCourses, setExportCourses] = useState<Course[]>([]);
  const [exportCoursesState, setExportCoursesState] = useState<"idle" | "loading" | "error">(
    showExportCourses ? "loading" : "idle"
  );
  // Bumped after ImportCourseExportControl below creates a fresh course_hub
  // row, so the "courses with a saved export" list below picks up the new
  // row on its next render without the instructor having to reload the
  // page. The effect that fetches exportCourses re-runs whenever this
  // changes (see its dependency array).
  const [exportCoursesRefreshVersion, setExportCoursesRefreshVersion] = useState(0);

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

  // Export-only (or export-and-live) course_hub rows the export section
  // below offers, gated behind `showExportCourses` so every OTHER caller of
  // this shared picker (Communications tab, workflow entity pickers, etc.)
  // stays byte-identical to before this feature - they never pass the prop,
  // so this effect never runs for them. Institution-agnostic on purpose
  // (see the prop's own doc comment): reading a stored export needs no
  // Canvas credential, so unlike the Canvas course list above, this list is
  // not re-fetched on institution change.
  useEffect(() => {
    if (!showExportCourses) return;
    let cancelled = false;
    (async () => {
      const result = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in result) {
        setExportCourses([]);
        setExportCoursesState("error");
        return;
      }
      setExportCourses(result.courses);
      setExportCoursesState("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [showExportCourses, exportCoursesRefreshVersion]);

  // Persist pinned courses to localStorage whenever they change (external sync).
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SAVED_COURSES_KEY, JSON.stringify(savedCourses));
    }
  }, [savedCourses]);

  const courseId = parseCanvasCourseId(courseUrl);
  const isSaved = !!courseId && savedCourses.some((c) => c.id === courseId);

  // Classifies the export section's current state (loading / error / ready /
  // one of the two empty shapes) from the raw rows above - see
  // src/lib/course-picker-availability.ts for the wording and the AC4/AC5
  // rule this owns.
  const exportSectionState = describeExportSectionState(exportCoursesState, exportCourses);

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

  // ImportCourseExportControl below has already created (when needed),
  // uploaded, and attached the export by the time this fires - all that
  // remains is refreshing this section's chip list (so the new/updated row
  // shows up without a reload) and selecting it through the SAME path a
  // chip click already uses.
  const handleImported = (courseId: string) => {
    setExportCoursesRefreshVersion((v) => v + 1);
    onSelectExport?.(courseId);
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
        <div className={tableStyles.rowSm}>
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
              placeholder={
                // FINDING 2 fix (docs/REGRESSION.md entry 295's follow-up):
                // with no institution selected, `coursesState` sits at
                // "idle" and `courses` is empty by construction (the fetch
                // effect below never runs without an acronym) - falling
                // through to "No courses found" would claim a search
                // happened and came up empty, which is false. Checked first
                // so it wins over both the loading and empty-result cases
                // below.
                !activeInstitution
                  ? "No school selected"
                  : coursesState === "loading"
                  ? "Loading courses..."
                  : courses.length === 0
                  ? "No courses found"
                  : "Select a course..."
              }
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
        {!activeInstitution && (
          <p className={styles.fieldHint}>{describeNoInstitutionSelected()}</p>
        )}
        {coursesState === "error" && (
          <p className={styles.fieldHint}>Could not list courses for this school.</p>
        )}
        {loadError && <p className={styles.error}>{loadError}</p>}
      </div>

      {showExportCourses && (
        <div className={styles.field}>
          <label>Courses with a saved export</label>
          {exportSectionState.kind === "ready" && (
            <>
              <div className={tableStyles.rowSm}>
                {exportSectionState.courses.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    onClick={() => onSelectExport?.(c.id)}
                    size="small"
                    color={selectedExportCourseId === c.id ? "primary" : "default"}
                    variant={selectedExportCourseId === c.id ? "filled" : "outlined"}
                    sx={{ maxWidth: 260 }}
                  />
                ))}
              </div>
              <p className={styles.fieldHint}>Reads from the course&apos;s saved export file instead of live Canvas.</p>
            </>
          )}
          {exportSectionState.kind === "loading" && (
            <p className={styles.fieldHint}>Loading your saved courses...</p>
          )}
          {exportSectionState.kind === "error" && (
            <p className={styles.fieldHint}>{exportSectionState.message}</p>
          )}
          {(exportSectionState.kind === "empty-no-exports" || exportSectionState.kind === "empty-only-generated") && (
            <p className={styles.fieldHint}>{exportSectionState.message}</p>
          )}
          {/* B1: renders directly beneath this section, including when it is
              empty (exactly the state a first-time importer is in - they
              have no saved courses with an export yet, which is precisely
              why they need this control). Not nested inside any of the
              exportSectionState branches above, so it is unconditional for
              every one of them. */}
          <ImportCourseExportControl onImported={handleImported} />
        </div>
      )}

      {savedCourses.length > 0 && (
        <div className={styles.field}>
          <label>Saved courses</label>
          <div className={tableStyles.rowSm}>
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
