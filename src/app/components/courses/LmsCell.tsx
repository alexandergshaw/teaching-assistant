"use client";

// The LMS scalar column's cell editor: select (Canvas/Blackboard/Not set) +
// a searchable picker of the institution's connected LMS courses. Ported
// from CoursesTab's tileLmsEditor.
import { useEffect, useId, useState, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import { listCoursesAction } from "@/app/actions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import { useInstitutionSelection } from "@/lib/institutions";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { COURSE_LMS_OPTIONS, courseLmsLabel } from "@/lib/course-lms-options";
import { lmsConnectionStatusFor, type LmsConnectionStatus } from "@/lib/courses-table-helpers";
import Typeahead from "../ui/Typeahead";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface LmsCellProps {
  course: Course;
  onSave: (rawValue: string, extra?: Partial<CourseInput>) => Promise<boolean | null>;
  /** F1/F2: this course's live Canvas check (ok) and/or error, forwarded from
   * useCoursesData via CoursesTable/CourseRow, both keyed by course.id there
   * - see lmsConnectionStatusFor's own doc comment for what each state means
   * and why "no live result yet" is reported as "unknown", never as
   * "connected". */
  liveCheck?: { needsGrading: number; unread: number };
  liveError?: string;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

/** F1: the honest status pill - text always carries the state (WCAG 1.4.1),
 * colour is only reinforcement. Uses page.module.css's existing ghBadge
 * family (the same idiom CourseRow.tsx's own calendar-blocker pill uses at
 * :558-566) rather than any new class, so this needed zero additions to
 * CoursesTable.module.css (already at 938/950 lines). Deliberately reports
 * the LIVE path (canvasUrl + institution + the live check) and never
 * course.lms - see course-lms-options.ts's own comment: the `lms` select is
 * a label, "does not create a live integration". */
function LmsStatusPill({ status }: { status: LmsConnectionStatus }) {
  const badgeClass = `${styles.ghBadge} ${tableStyles.badgeBlock} ${tableStyles.mt1Only}`;
  switch (status.kind) {
    case "not-linked":
      return <span className={`${badgeClass} ${styles.ghBadgeNeutral}`}>Not linked</span>;
    case "needs-institution":
      return (
        <span className={`${badgeClass} ${styles.ghBadgeWarning}`}>
          Needs an institution before LMS actions work
        </span>
      );
    case "unknown":
      return <span className={`${badgeClass} ${styles.ghBadgeNeutral}`}>Connection not yet checked</span>;
    case "connected": {
      const total = status.needsGrading + status.unread;
      return (
        <span className={`${badgeClass} ${styles.ghBadgeSuccess}`}>
          {total > 0 ? `Connected - ${total} item${total === 1 ? "" : "s"} need attention` : "Connected"}
        </span>
      );
    }
    case "failed":
      return <span className={`${badgeClass} ${styles.ghBadgeDanger}`}>Connection failed: {status.reason}</span>;
  }
}

export default function LmsCell({ course, onSave, liveCheck, liveError, menu }: LmsCellProps) {
  const { active: activeInstitution } = useInstitutionSelection();
  const [editing, setEditing] = useState(false);
  const [lmsDraft, setLmsDraft] = useState(course.lms ?? "");
  const [canvasUrlDraft, setCanvasUrlDraft] = useState<string | null>(null);
  const [opts, setOpts] = useState<Array<{ url: string; name: string }> | null>(null);
  const [optsError, setOptsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const institution = course.institution || activeInstitution;
  // F4: stable base for this cell's field ids (label htmlFor / aria-
  // describedby) - one useId per cell instance, never recomputed per render.
  const baseId = useId();
  const lmsSelectId = `${baseId}-lms-select`;
  const lmsHintId = `${lmsSelectId}-hint`;
  const courseFieldId = `${baseId}-lms-course`;
  const courseErrorId = `${courseFieldId}-error`;

  useEffect(() => {
    if (!editing || !institution) return;
    let cancelled = false;
    (async () => {
      const result = await listCoursesAction(institution);
      if (cancelled) return;
      if ("error" in result) {
        setOptsError(result.error);
        setOpts([]);
        return;
      }
      setOpts(result.courses.map((c) => ({ url: `/courses/${c.id}`, name: c.name })));
      setOptsError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, institution]);

  const startEdit = () => {
    setLmsDraft(course.lms ?? "");
    setCanvasUrlDraft(null);
    setOpts(null);
    setOptsError(null);
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(lmsDraft, canvasUrlDraft !== null ? { canvasUrl: canvasUrlDraft || null } : {});
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  if (!editing) {
    // F1: the pill reports the LIVE path (canvasUrl + institution + the live
    // check), independent of whether course.lms itself is set - a course can
    // have a working Canvas connection with no `lms` label chosen, or an
    // `lms` label with no working connection, and the pill must be right
    // either way (course-lms-options.ts: `lms` "does not create a live
    // integration").
    const status = lmsConnectionStatusFor(course, liveCheck, liveError);
    return (
      <td onClick={startEdit} title="Click to edit" className={tableStyles.clickToEdit}>
        {course.lms ? (
          <>
            <span className={styles.courseResourceValue}>{courseLmsLabel(course.lms)}</span>
            {course.canvasUrl && (
              course.canvasUrl.startsWith("http") ? (
                <a className={styles.courseResourceValue} style={{ display: "block" }} href={course.canvasUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  Open LMS course
                </a>
              ) : (
                <span className={styles.courseResourceValue} style={{ display: "block" }}>Course {parseCanvasCourseId(course.canvasUrl)} linked</span>
              )
            )}
          </>
        ) : (
          <span className={styles.courseResourceEmpty}>Not set</span>
        )}
        <LmsStatusPill status={status} />
        {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
      </td>
    );
  }

  const typeaheadOpts = (opts ?? []).map((opt) => ({ value: opt.url, label: opt.name }));
  const rawUrl = canvasUrlDraft ?? (course.canvasUrl ?? "");
  const currentId = rawUrl ? parseCanvasCourseId(rawUrl) : null;
  const matched = currentId ? typeaheadOpts.find((opt) => opt.value === `/courses/${currentId}`) : undefined;
  const currentUrl = matched ? matched.value : rawUrl;
  if (currentUrl && !matched && !typeaheadOpts.some((opt) => opt.value === currentUrl)) {
    typeaheadOpts.push({ value: currentUrl, label: currentUrl });
  }

  return (
    <td data-cell-editing="true" style={{ minWidth: 220 }}>
      <div className={styles.tileEditor}>
        {/* F4: label/hint/control association via styles.field - the same
         * shell shape as workflows/FieldShell.tsx (not the component itself,
         * which is bound to Pick<RuntimeField,...>): a real <label htmlFor>
         * pointing at the control, and the hint tied on via aria-describedby
         * rather than only sitting visually below it. styles.field's own
         * label rule already IS the pinned micro-label idiom (font-size-2xs
         * / 700 / 0.06em / text-secondary - page.module.css:154-160), so no
         * new CSS is needed for it. */}
        <div className={styles.field}>
          <label htmlFor={lmsSelectId}>LMS course</label>
          <TextField
            id={lmsSelectId}
            select
            size="small"
            fullWidth
            value={lmsDraft}
            onChange={(e) => setLmsDraft(e.target.value)}
            // Select mode renders through MUI's own Select component (not a
            // plain <input>) - slotProps.select is the channel that reaches
            // its actual root element; slotProps.htmlInput would not apply
            // here (same reasoning as RuntimeFieldInput.tsx's own select
            // branch).
            slotProps={{ select: { "aria-describedby": lmsHintId } }}
          >
            <MenuItem value="">Not set</MenuItem>
            {COURSE_LMS_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
          <p id={lmsHintId} className={styles.fieldHint}>Optional - a label only, not itself a live connection.</p>
        </div>
        {institution ? (
          <div className={styles.field}>
            <label htmlFor={courseFieldId}>Connected course</label>
            <Typeahead
              id={courseFieldId}
              options={typeaheadOpts}
              value={currentUrl}
              onChange={setCanvasUrlDraft}
              placeholder={opts === null ? "Loading courses…" : "Choose a connected course…"}
              loading={opts === null}
              noOptionsText="No connected courses"
              aria-describedby={optsError ? courseErrorId : undefined}
            />
            {optsError && <p id={courseErrorId} className={styles.error}>{optsError}</p>}
          </div>
        ) : (
          <p className={styles.fieldHint}>Add an institution to pick a connected course.</p>
        )}
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={saving} onClick={() => void commit()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </td>
  );
}
