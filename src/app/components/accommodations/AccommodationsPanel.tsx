"use client";

// The accommodations/extensions panel (backlog N4). Mounted only while open
// (see AccommodationsAmbientControl.tsx, which conditionally renders this
// component rather than always mounting it hidden) - unmounting on close is
// this file's mechanism for "drops the data on close" (requirement 7 of the
// build brief): there is no state left to drop, because React discards it.
//
// THIS IS DISABILITY-RELATED STUDENT DATA. Read this file's imports' own
// headers (src/lib/accommodations.ts, src/app/actions/accommodations.ts)
// before changing anything here - they carry the reasoning this file leans
// on (the impersonation guard, the session client, the barrel routing).
//
// NAME RESOLUTION IS ALWAYS LIVE, NEVER FROM STORAGE. Course names,
// assignment names, and student names are resolved every time this panel
// opens by re-calling listCoursesAction/listAssignmentsAction/
// listStudentsAction and filtering the returned list on the stored id (see
// resolveNameFromList below). Nothing resolved this way is ever written to
// localStorage - only the two scope-selection ids are (ta-accom-course-id,
// ta-accom-assignment-id; see accommodations.structure.test.ts for the
// exact-set scan that enforces this).
//
// ATTRIBUTE-BORNE IDENTITY (requirement 2 of the build brief - the hardest
// part of this wave, stated here rather than only in the report): the
// unselectable mechanism (AccommodationsText) covers rendered TEXT NODES,
// not attribute values. Two deliberate choices close that gap for this
// panel's controls:
//   1. The student picker below is a plain native <select>, not an MUI
//      Autocomplete. Its `value` attribute (on each <option>) carries only
//      the opaque Canvas user id, never the student's name - the name is
//      the <option>'s text content, which a native <select>'s closed-state
//      chrome and open dropdown list render as OS-level UI, not a DOM text
//      node reachable by the page's own user-select CSS or by
//      window.getSelection() the way an MUI Autocomplete's backing
//      <input value="..."> would be.
//   2. Every icon button (delete, edit, close) uses a constant, generic
//      aria-label ("Delete accommodation", "Edit note", "Close") - never a
//      label built from a student's name or note text.
// The TWO places this panel cannot fully close the gap: the add-form note
// textarea's `value={newNote}` (the owner's own freshly-typed text - never
// pre-populated from stored data) and the edit-form note textarea's
// `value={editNote}`, which must carry the existing note's text so the
// owner can edit it rather than retyping a sensitive note from scratch (see
// updateAccommodation's own header, orchestrator ruling N4-W). Both are a
// different case from the picker/tooltip pattern the rule targets - each is
// the one authoritative editable copy of free text, not a display
// duplicate - but it is still true that a native textarea does not honor
// `user-select: none` on its own editable content in most browsers, so
// neither field is covered by the unselectable mechanism at all. Stated
// plainly per requirement 3: this is a real, currently-unclosed gap for the
// note field while it is being typed or edited, not a hidden one.
// accommodations.wiring.test.ts asserts these are the ONLY two identity-
// bearing `value=` sites in this file.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import styles from "./AccommodationsPanel.module.css";
import AccommodationsText from "./AccommodationsText";
import { ModalShell } from "../ui/ModalShell";
import { useInstitutionSelection } from "@/lib/institutions";
import { isAccommodationsSelectionComplete } from "@/lib/accommodations-logic";
import type { AccommodationEntry } from "@/lib/accommodations";
import type { CanvasCourse, CanvasAssignmentBrief, CanvasPerson } from "@/lib/canvas/listings";
import {
  listCoursesAction,
  listAssignmentsAction,
  listStudentsAction,
  listAccommodationsAction,
  addAccommodationAction,
  updateAccommodationAction,
  deleteAccommodationAction,
} from "@/app/actions";

const COURSE_ID_KEY = "ta-accom-course-id";
const ASSIGNMENT_ID_KEY = "ta-accom-assignment-id";

// Constant, generic accessible name for ModalShell's required `label` prop -
// never built from a name, note, or count (build brief requirement 2).
// Mirrors AccommodationsAmbientControl.tsx's own LABEL constant, which is
// the fixed aria-label/title on the button that opens this panel.
const PANEL_LABEL = "Accommodations and extensions";

function readPersisted(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writePersisted(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Best-effort only - never block the UI on a storage failure.
  }
}

/**
 * Resolve a display name for `id` out of an already-fetched list, in one of
 * the three render states this feature always uses for a live-resolved
 * identity (Ruling N4-U): resolved name, or null when the list loaded fine
 * but the id is no longer present in it (caller distinguishes "not found"
 * from "list itself failed to load").
 */
function resolveNameFromList<T extends { id: string; name: string }>(
  list: T[] | null,
  id: string
): string | null {
  if (!list) return null;
  return list.find((item) => item.id === id)?.name ?? null;
}

type ListState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; items: T[] };

export default function AccommodationsPanel({
  onClose,
  restoreFocusRef,
}: {
  onClose: () => void;
  /** The opening button, captured by the caller at the moment it opened
   * this panel - forwarded unchanged to ModalShell/useModalDismiss. See
   * AccommodationsAmbientControl.tsx's `triggerRef`, the exact precedent
   * (AttachmentsPanel.tsx's `previewTriggerRef`) this mirrors. Omitted only
   * when there is no sensible opener to return focus to. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { active: institution } = useInstitutionSelection();

  const [courseId, setCourseId] = useState(() => readPersisted(COURSE_ID_KEY));
  const [assignmentId, setAssignmentId] = useState(() => readPersisted(ASSIGNMENT_ID_KEY));

  const [courses, setCourses] = useState<ListState<CanvasCourse>>({ status: "idle" });
  const [assignments, setAssignments] = useState<ListState<CanvasAssignmentBrief>>({ status: "idle" });
  const [roster, setRoster] = useState<ListState<CanvasPerson>>({ status: "idle" });
  const [entries, setEntries] = useState<ListState<AccommodationEntry>>({ status: "idle" });

  const [newStudentId, setNewStudentId] = useState("");
  const [newNote, setNewNote] = useState("");
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  // Per-invocation sequence tokens (requirement 9 of the build brief) -
  // mirrors AccessibilityProvider.tsx's scanRunId/aborted() idiom. Bumped on
  // every dependency change AND on unmount, so a fetch that resolves after
  // the scope changed again, or after this panel closes/unmounts, is
  // discarded rather than writing stale (or, on close, ANY) data into state.
  const coursesRunId = useRef(0);
  const assignmentsRunId = useRef(0);
  const rosterRunId = useRef(0);
  const entriesRunId = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Every aborted() check below tests !mountedRef.current in addition
      // to its own sequence token, so this alone is sufficient to discard
      // any fetch that resolves after this panel unmounts/closes.
      mountedRef.current = false;
    };
  }, []);

  // Courses: fetched once per institution, while the panel is open. No
  // explicit "idle" reset when institution is cleared - courses.status may
  // briefly hold a stale value in that case, but nothing renders it: every
  // render guard below requires institution/courseId/assignmentId to be
  // non-empty (isAccommodationsSelectionComplete), and course/assignment
  // NAMES are not the sensitive data this feature protects. Resetting
  // synchronously here would call setState directly in the effect body with
  // no await ahead of it, which this repo's lint forbids (see the
  // cancelled-flag idiom this file otherwise follows, CartridgeDropPanel.tsx).
  useEffect(() => {
    if (!institution) {
      return;
    }
    const runId = ++coursesRunId.current;
    const aborted = () => coursesRunId.current !== runId || !mountedRef.current;
    (async () => {
      setCourses({ status: "loading" });
      try {
        const result = await listCoursesAction(institution);
        if (aborted()) return;
        if ("error" in result) {
          setCourses({ status: "error", message: result.error });
        } else {
          setCourses({ status: "loaded", items: result.courses });
        }
      } catch (err) {
        if (aborted()) return;
        setCourses({ status: "error", message: err instanceof Error ? err.message : "Could not load courses." });
      }
    })();
  }, [institution]);

  // Assignments: fetched once per (institution, courseId). Same
  // no-synchronous-idle-reset reasoning as the courses effect above.
  useEffect(() => {
    if (!institution || !courseId) {
      return;
    }
    const runId = ++assignmentsRunId.current;
    const aborted = () => assignmentsRunId.current !== runId || !mountedRef.current;
    (async () => {
      setAssignments({ status: "loading" });
      try {
        const result = await listAssignmentsAction(institution, courseId);
        if (aborted()) return;
        if ("error" in result) {
          setAssignments({ status: "error", message: result.error });
        } else {
          setAssignments({ status: "loaded", items: result.assignments });
        }
      } catch (err) {
        if (aborted()) return;
        setAssignments({ status: "error", message: err instanceof Error ? err.message : "Could not load assignments." });
      }
    })();
  }, [institution, courseId]);

  // Roster (in-memory only - Ruling N4-L. No browser-storage call of any
  // kind anywhere in this effect; accommodations.structure.test.ts's
  // negative scan, with its own canary, enforces that this stays true).
  // Re-fetched every time the course changes, and every time the panel
  // (re)opens, since this component is unmounted on close.
  useEffect(() => {
    if (!institution || !courseId) {
      return;
    }
    const runId = ++rosterRunId.current;
    const aborted = () => rosterRunId.current !== runId || !mountedRef.current;
    (async () => {
      setRoster({ status: "loading" });
      try {
        const result = await listStudentsAction(institution, courseId);
        if (aborted()) return;
        if ("error" in result) {
          setRoster({ status: "error", message: result.error });
        } else {
          setRoster({ status: "loaded", items: result.students });
        }
      } catch (err) {
        if (aborted()) return;
        setRoster({ status: "error", message: err instanceof Error ? err.message : "Could not load the roster." });
      }
    })();
  }, [institution, courseId]);

  const selectionComplete = isAccommodationsSelectionComplete(institution, courseId, assignmentId);

  // Entries: only once a complete scope is selected. This is the FIRST
  // accommodations-data fetch of any kind (requirement 7) - nothing above
  // this effect ever touches institution_accommodations. No synchronous
  // "idle" reset when the scope becomes incomplete: every render guard for
  // entries below requires `selectionComplete` (recomputed fresh each
  // render from institution/courseId/assignmentId, never from this state),
  // so a stale entries.status="loaded" value can never render once the
  // scope is incomplete - the render gate is the enforcement, not this
  // effect clearing state, which this repo's lint forbids doing
  // synchronously here anyway.
  useEffect(() => {
    if (!selectionComplete) {
      return;
    }
    const runId = ++entriesRunId.current;
    const aborted = () => entriesRunId.current !== runId || !mountedRef.current;
    (async () => {
      setEntries({ status: "loading" });
      try {
        const result = await listAccommodationsAction(institution, courseId, assignmentId);
        if (aborted()) return;
        if ("error" in result) {
          setEntries({ status: "error", message: result.error });
        } else {
          setEntries({ status: "loaded", items: result.entries });
        }
      } catch (err) {
        if (aborted()) return;
        setEntries({ status: "error", message: err instanceof Error ? err.message : "Could not load the accommodations list." });
      }
    })();
    // institution/courseId/assignmentId are exactly the three inputs
    // isAccommodationsSelectionComplete reads (AC-L3) - selectionComplete
    // itself is derived, not an independent dependency, but is listed
    // alongside them below since it is recomputed every render.
  }, [institution, courseId, assignmentId, selectionComplete]);

  const handleCourseChange = (value: string) => {
    setCourseId(value);
    writePersisted(COURSE_ID_KEY, value);
    setAssignmentId("");
    writePersisted(ASSIGNMENT_ID_KEY, "");
  };

  const handleAssignmentChange = (value: string) => {
    setAssignmentId(value);
    writePersisted(ASSIGNMENT_ID_KEY, value);
  };

  const courseName = resolveNameFromList(courses.status === "loaded" ? courses.items : null, courseId);
  const assignmentName = resolveNameFromList(assignments.status === "loaded" ? assignments.items : null, assignmentId);

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newStudentId) {
      setAddError("Choose a student first.");
      return;
    }
    setAddError("");
    setSaving(true);
    try {
      const result = await addAccommodationAction({
        institution,
        courseId,
        assignmentId,
        canvasUserId: newStudentId,
        note: newNote,
      });
      if (!mountedRef.current) return;
      if ("error" in result) {
        setAddError(result.error);
      } else {
        setEntries((prev) => (prev.status === "loaded" ? { status: "loaded", items: [...prev.items, result.entry] } : prev));
        setNewStudentId("");
        setNewNote("");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setAddError(err instanceof Error ? err.message : "Could not save that accommodation.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteAccommodationAction(id);
    if (!mountedRef.current) return;
    if (!("error" in result)) {
      setEntries((prev) => (prev.status === "loaded" ? { status: "loaded", items: prev.items.filter((e) => e.id !== id) } : prev));
    }
  }

  function startEdit(entry: AccommodationEntry) {
    setEditingId(entry.id);
    setEditNote(entry.note);
  }

  async function handleEditSubmit(id: string) {
    const result = await updateAccommodationAction(id, editNote);
    if (!mountedRef.current) return;
    if (!("error" in result)) {
      setEntries((prev) =>
        prev.status === "loaded" ? { status: "loaded", items: prev.items.map((e) => (e.id === id ? result.entry : e)) } : prev
      );
      setEditingId(null);
    }
  }

  const rosterList = roster.status === "loaded" ? roster.items : null;

  return (
    <ModalShell
      label={PANEL_LABEL}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      contentStyle={{
        width: "min(100%, 480px)",
        height: "auto",
        maxHeight: "calc(100vh - var(--space-12))",
        overflowY: "auto",
      }}
      contentClassName={styles.panel}
    >
        <div className={styles.headerRow}>
          <h2 className={styles.title}>Accommodations and extensions</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="accom-institution">Institution</label>
          <InstitutionSelect />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="accom-course">Course</label>
          <select
            id="accom-course"
            className={styles.select}
            value={courseId}
            onChange={(e) => handleCourseChange(e.target.value)}
            disabled={!institution || courses.status === "loading"}
          >
            <option value="">Choose a course...</option>
            {courses.status === "loaded" &&
              courses.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          {courses.status === "error" && <p className={styles.errorLine}>{courses.message}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="accom-assignment">Assignment</label>
          <select
            id="accom-assignment"
            className={styles.select}
            value={assignmentId}
            onChange={(e) => handleAssignmentChange(e.target.value)}
            disabled={!courseId || assignments.status === "loading"}
          >
            <option value="">Choose an assignment...</option>
            {assignments.status === "loaded" &&
              assignments.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          {assignments.status === "error" && <p className={styles.errorLine}>{assignments.message}</p>}
        </div>

        {/* AC-X1: the scope label is shown whenever the panel has started (or
            finished) fetching for a complete scope - loading, loaded, AND
            error - never only on success, so an error never renders under a
            label implying a correct, confidently-empty result. Sourced from
            the SAME lists the fetch just used, filtered on the stored ids -
            never echoed from the persisted selection ahead of a fetch
            actually running for it. */}
        {selectionComplete && entries.status !== "idle" && (
          <AccommodationsText as="p" className={styles.scopeLabel}>
            {institution} - {courseName ?? `Course ${courseId}`} - {assignmentName ?? `Assignment ${assignmentId}`}
          </AccommodationsText>
        )}

        {selectionComplete && entries.status === "loading" && <p className={styles.statusLine}>Loading accommodations for this scope...</p>}

        {/* Requirement 10: a failed fetch gets its OWN state and copy - never
            rendered as an empty list. "No students have accommodations for
            this scope" and "we could not load the list" are different
            facts. */}
        {selectionComplete && entries.status === "error" && (
          <p className={styles.errorLine}>Could not load the accommodations list for this scope. {entries.message}</p>
        )}

        {selectionComplete && entries.status === "loaded" && entries.items.length === 0 && (
          <p className={styles.statusLine}>No students have accommodations or extensions recorded for this scope yet.</p>
        )}

        {selectionComplete && entries.status === "loaded" && entries.items.length > 0 && (
          <ul className={styles.list}>
            {entries.items.map((entry) => {
              const resolvedName = resolveNameFromList(rosterList, entry.canvasUserId);
              const nameDisplay =
                roster.status === "error"
                  ? `Student id ${entry.canvasUserId} (roster could not be resolved)`
                  : resolvedName !== null
                    ? resolvedName
                    : roster.status === "loaded"
                      ? `Student id ${entry.canvasUserId} (no longer on the roster)`
                      : `Student id ${entry.canvasUserId} (resolving...)`;
              return (
                <li key={entry.id} className={styles.row}>
                  <div className={styles.rowText}>
                    <AccommodationsText>{nameDisplay}</AccommodationsText>
                    {editingId === entry.id ? (
                      <div className={styles.field}>
                        {/* See this file's header: the edit textarea's value
                            necessarily carries the note text so it can be
                            edited - a known, stated exception to the
                            no-value-attribute rule, and not covered by
                            user-select:none (textareas do not honor that
                            property on their own editable content). */}
                        <textarea
                          className={styles.textarea}
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          aria-label="Edit note"
                        />
                        <div className={styles.formActions}>
                          <button type="button" className={styles.secondaryButton} onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                          <button type="button" className={styles.primaryButton} onClick={() => handleEditSubmit(entry.id)}>
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      entry.note && <AccommodationsText>{entry.note}</AccommodationsText>
                    )}
                  </div>
                  {editingId !== entry.id && (
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconButton} onClick={() => startEdit(entry)} aria-label="Edit note">
                        <EditIcon />
                      </button>
                      <button type="button" className={styles.iconButton} onClick={() => handleDelete(entry.id)} aria-label="Delete accommodation">
                        <DeleteIcon />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {selectionComplete && (
          <form className={styles.addForm} onSubmit={handleAddSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="accom-new-student">Student</label>
              {/* Native <select>, deliberately not an MUI Autocomplete - see
                  this file's header, point 1. The `value` on each option is
                  the opaque canvas id only; the student's name is the
                  option's text content, not an attribute. */}
              <select
                id="accom-new-student"
                className={styles.select}
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
                disabled={roster.status !== "loaded"}
              >
                <option value="">Choose a student...</option>
                {rosterList?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {roster.status === "error" && <p className={styles.errorLine}>Could not load the roster. {roster.message}</p>}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="accom-new-note">Note</label>
              <textarea
                id="accom-new-note"
                className={styles.textarea}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="e.g. 50% extended time (optional)"
              />
            </div>
            {addError && <p className={styles.errorLine}>{addError}</p>}
            <div className={styles.formActions}>
              <button type="submit" className={styles.primaryButton} disabled={saving || !newStudentId}>
                {saving ? "Saving..." : "Add"}
              </button>
            </div>
          </form>
        )}
    </ModalShell>
  );
}

function InstitutionSelect() {
  const { institutions, active, setActive } = useInstitutionSelection();
  return (
    <select id="accom-institution" className={styles.select} value={active} onChange={(e) => setActive(e.target.value)}>
      {institutions.length === 0 && <option value="">No institution configured</option>}
      {institutions.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
