"use client";

import type React from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import type { CanvasModule, CanvasRubric } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import type { RubricBuilderTarget } from "./useRubrics";
import { resolveSyllabusQuizTarget, type LmsSyllabusButtonsBusy } from "./useLmsSyllabusButtons";
import { NEW_MODULE_TARGET_VALUE } from "@/lib/syllabus-ack-quiz-target";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "../contentSourceGating";

export interface ModulesHeaderBarProps {
  courseName?: string;
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so every existing call site
   * (none of which pass this yet) is unaffected. Gates only the three
   * buttons below that create brand-new course-level content ("Create
   * modules", the syllabus quiz, syllabus generation) - every other control
   * here either isn't a Canvas write (Select/search) or already depends on
   * the `modules` prop, which is empty in export mode for the same reason
   * "This course has no modules yet" is (ContentTab never populates the
   * live-shaped `modules` state from an export - see that component's
   * `loadContent`), so it needs no separate gate. */
  sourceContext?: ContentSourceContext;
  onExport: () => void;
  onImport: () => void;
  canCopy: boolean;
  reload: () => void;
  busy: boolean;
  refreshing: boolean;
  moduleSearch: string;
  setModuleSearch: (v: string) => void;
  allSelected: boolean;
  toggleAll: () => void;
  allKeysLength: number;
  allModulesSelected: boolean;
  toggleAllModules: () => void;
  visibleModulesLength: number;
  selectByKind: (kind: string) => void;
  modules: CanvasModule[];
  setBulkUploadOpen: (v: boolean) => void;
  setBulkCreateOpen: (v: boolean) => void;
  setRenameOpen: (v: boolean) => void;
  setScheduleOpen: (v: boolean) => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R2): each opener captures `event.currentTarget` synchronously, in
   * addition to (never instead of) the matching boolean-open setter above -
   * bulkCreateModules.wiring.test.ts reads this file as text and pins the
   * exact shape of those three setter calls and the disabled expression that
   * follows each one, so capture is added alongside them rather than folded
   * into a renamed opener function (which would also change what that guard
   * sees). Deliberately not spelling out the calls themselves here, so this
   * comment cannot be mistaken by that same text-reading guard for the code
   * it is meant to police. ModulesView owns the ref each trigger writes
   * into. */
  onBulkUploadTrigger: (trigger: HTMLElement) => void;
  onBulkCreateTrigger: (trigger: HTMLElement) => void;
  onRenameTrigger: (trigger: HTMLElement) => void;
  onSchedulerTrigger: (trigger: HTMLElement) => void;
  rubrics: CanvasRubric[];
  setRubricBuilder: React.Dispatch<React.SetStateAction<RubricBuilderTarget | null>>;
  /** Same capture-alongside-the-existing-setter shape as the four triggers
   * above - RubricBuilderModal has four openers total (two here, two in
   * BulkItemsSection), all writing the SAME ref (decision 4: one ref per
   * dialog, not per opener). */
  onRubricBuilderTrigger: (trigger: HTMLElement) => void;
  editRubricId: number | "";
  setEditRubricId: (v: number | "") => void;
  /** The two one-click LMS-tab syllabus buttons (useLmsSyllabusButtons) -
   * docs/lms-tab-syllabus-buttons-acceptance-criteria.md. */
  syllabusButtonsBusy: LmsSyllabusButtonsBusy;
  onCreateAckQuiz: () => void;
  onGenerateSyllabus: () => void;
  syllabusTemplateFileInputRef: React.RefObject<HTMLInputElement | null>;
  onSyllabusTemplateFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** AC1-AC9 (docs/syllabus-ack-quiz-module-target-acceptance-criteria.md):
   * which module the NEXT "Syllabus quiz" press should link into - an
   * inline select in this same group (AC1/AC9: no modal, nothing rendered
   * as an overlay from this header). "" means no target (AC2's default-
   * nothing floor); NEW_MODULE_TARGET_VALUE means "create a new module",
   * whose name is `syllabusNewModuleName`. Options come from the `modules`
   * prop already above - no separate options prop needed. */
  syllabusModuleChoice: string;
  onSyllabusModuleChoiceChange: (v: string) => void;
  syllabusNewModuleName: string;
  onSyllabusNewModuleNameChange: (v: string) => void;
}

// Sticky-header top bar: course title + copy/import/refresh, the module/item
// search box, and the select / files / modules / rubrics quick-action bar.
export function ModulesHeaderBar({
  courseName,
  sourceContext,
  onExport,
  onImport,
  canCopy,
  reload,
  busy,
  refreshing,
  moduleSearch,
  setModuleSearch,
  allSelected,
  toggleAll,
  allKeysLength,
  allModulesSelected,
  toggleAllModules,
  visibleModulesLength,
  selectByKind,
  modules,
  setBulkUploadOpen,
  setBulkCreateOpen,
  setRenameOpen,
  setScheduleOpen,
  onBulkUploadTrigger,
  onBulkCreateTrigger,
  onRenameTrigger,
  onSchedulerTrigger,
  rubrics,
  setRubricBuilder,
  onRubricBuilderTrigger,
  editRubricId,
  setEditRubricId,
  syllabusButtonsBusy,
  onCreateAckQuiz,
  onGenerateSyllabus,
  syllabusTemplateFileInputRef,
  onSyllabusTemplateFileChange,
  syllabusModuleChoice,
  onSyllabusModuleChoiceChange,
  syllabusNewModuleName,
  onSyllabusNewModuleNameChange,
}: ModulesHeaderBarProps) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // "courseWrite": creates brand-new course-level content with no dependency
  // on any currently-displayed module's identity (unlike Rename/Schedule due
  // dates/Bulk upload, which already go fully inert on an empty `modules`
  // array - see the prop's own doc comment above for why those need nothing
  // new here). Still gated on `source === "export"`: the created content
  // would land in the live Canvas course, not in the static export snapshot
  // this bar is shown next to, which is its own kind of silent no-op.
  const courseWriteGate = gateOperation(ctx, "courseWrite");
  // FINDING FIX: the "Syllabus quiz" button used to disable only on `busy`/
  // `syllabusButtonsBusy`, so picking "New module…" and leaving the name
  // blank still let the button fire - a round trip that fails for something
  // already visible as incomplete right here. resolveSyllabusQuizTarget
  // (useLmsSyllabusButtons.ts) is the SAME check runCreateAckQuiz itself
  // runs before writing, reused rather than re-implemented, and it already
  // treats "" ("Not linked") as resolved - this button's long-standing
  // "create it unlinked" behaviour - so only a blank/whitespace new-module
  // name makes `.ok` false. Mirrors GeneratedPreviewModal.tsx's
  // `postTargetResolved` for its own "Post to Canvas" button.
  const syllabusTargetResolution = resolveSyllabusQuizTarget(syllabusModuleChoice, syllabusNewModuleName);
  return (
    <>
      <div className={styles.ccHeaderTop}>
        <h2 className={styles.ccCourseTitle}>{courseName || "Course content"}</h2>
        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Course copy</span>
          <Button
            variant="outlined"
            size="small"
            onClick={onExport}
            disabled={!canCopy}
            title="Copy this course's content into other courses"
          >
            Copy to…
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={onImport}
            disabled={!canCopy}
            title="Import another course's content into this one"
          >
            Import from…
          </Button>
          <span className={styles.ccBarDivider} aria-hidden="true" />
          <Button
            variant="outlined"
            size="small"
            onClick={reload}
            disabled={busy || refreshing}
            title="Reload this course's content"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
      <TextField
        type="search"
        size="small"
        fullWidth
        placeholder="Search modules and their items by name…"
        value={moduleSearch}
        onChange={(e) => setModuleSearch(e.target.value)}
      />
      <div className={styles.ccBar}>
        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Select</span>
          <FormControlLabel
            control={<Checkbox checked={allSelected} onChange={toggleAll} disabled={allKeysLength === 0} size="small" />}
            label="Items"
          />
          <FormControlLabel
            control={<Checkbox checked={allModulesSelected} onChange={toggleAllModules} disabled={visibleModulesLength === 0} size="small" />}
            label="Modules"
          />
          <TextField
            select
            size="small"
            sx={{ maxWidth: 150 }}
            value=""
            disabled={visibleModulesLength === 0}
            onChange={(e) => selectByKind(e.target.value)}
            aria-label="Select all items of a type"
          >
            <MenuItem value="">By type…</MenuItem>
            <MenuItem value="Graded">Graded items</MenuItem>
            <MenuItem value="Assignment">Assignments</MenuItem>
            <MenuItem value="Quiz">Quizzes</MenuItem>
            <MenuItem value="Discussion">Discussions</MenuItem>
            <MenuItem value="Page">Pages</MenuItem>
            <MenuItem value="File">Files</MenuItem>
          </TextField>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Files</span>
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => {
              onBulkUploadTrigger(e.currentTarget);
              setBulkUploadOpen(true);
            }}
            disabled={busy || modules.length === 0}
          >
            Bulk upload
          </Button>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Modules</span>
          {/* Unlike Rename/Schedule below, this is never disabled by an empty
              module list - bulk-creating a fresh module structure is exactly
              what an instructor needs on a brand-new, still-empty course.
              `aria-disabled` (not `disabled`) for the source gate below, per
              src/app/components/courses/CellMenu.tsx's precedent - `busy` is
              still a native `disabled`, momentary and paired with the label
              swap on the syllabus buttons. */}
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => {
              if (!courseWriteGate.allowed) return;
              onBulkCreateTrigger(e.currentTarget);
              setBulkCreateOpen(true);
            }}
            disabled={busy}
            aria-disabled={courseWriteGate.allowed ? undefined : "true"}
            aria-describedby={courseWriteGate.allowed ? undefined : "cc-course-write-reason"}
            sx={{ opacity: courseWriteGate.allowed ? 1 : 0.55 }}
          >
            Create modules
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => {
              onRenameTrigger(e.currentTarget);
              setRenameOpen(true);
            }}
            disabled={busy || modules.length === 0}
          >
            Rename
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => {
              onSchedulerTrigger(e.currentTarget);
              setScheduleOpen(true);
            }}
            disabled={busy || modules.length === 0}
          >
            Schedule due dates
          </Button>
          {/* One shared reason, referenced by aria-describedby from every
              button gated by courseWriteGate (also the two syllabus buttons
              below) - the SAME reason applies to all of them, so this avoids
              repeating the sentence three times across two bar groups. */}
          {!courseWriteGate.allowed && (
            <span id="cc-course-write-reason" className={styles.ccBarLabel} style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
              {courseWriteGate.reason}
            </span>
          )}
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Syllabus</span>
          {/* AC1/AC9: the "Into module" target for the NEXT "Syllabus quiz"
              press - inline in this same ccBarGroup, following the grammar
              the Rubrics "Edit…" select and the deck-template picker already
              use. No modal, nothing rendered as an overlay: this group sits
              inside .ccStickyHeader, a stacking context and a containing
              block for position: fixed (entry 272), which an inline select
              never has to fight. */}
          <TextField
            select
            size="small"
            label="Into module"
            value={syllabusModuleChoice}
            onChange={(e) => onSyllabusModuleChoiceChange(e.target.value)}
            disabled={busy || syllabusButtonsBusy !== ""}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Not linked</MenuItem>
            {modules.map((m) => (
              <MenuItem key={m.id} value={String(m.id)}>
                {m.name}
              </MenuItem>
            ))}
            <MenuItem value={NEW_MODULE_TARGET_VALUE}>New module…</MenuItem>
          </TextField>
          {syllabusModuleChoice === NEW_MODULE_TARGET_VALUE && (
            <TextField
              size="small"
              label="New module name"
              value={syllabusNewModuleName}
              onChange={(e) => onSyllabusNewModuleNameChange(e.target.value)}
              disabled={busy || syllabusButtonsBusy !== ""}
            />
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              if (!courseWriteGate.allowed) return;
              onCreateAckQuiz();
            }}
            disabled={busy || syllabusButtonsBusy !== "" || !syllabusTargetResolution.ok}
            aria-disabled={courseWriteGate.allowed ? undefined : "true"}
            aria-describedby={
              [
                courseWriteGate.allowed ? null : "cc-course-write-reason",
                syllabusTargetResolution.ok ? null : "cc-syllabus-target-reason",
              ]
                .filter((id): id is string => id !== null)
                .join(" ") || undefined
            }
            sx={{ opacity: courseWriteGate.allowed ? 1 : 0.55 }}
            title={
              courseWriteGate.allowed && syllabusTargetResolution.ok
                ? "Create a 1-point Syllabus Acknowledgement quiz due 3 days after the course's start date"
                : undefined
            }
          >
            {syllabusButtonsBusy === "quiz" ? "Creating…" : "Syllabus quiz"}
          </Button>
          {/* Discoverable reason for the target-unresolved disablement above -
              same idiom as cc-course-write-reason below (a visible span, its
              id wired via aria-describedby) rather than a bare `disabled`
              with no explanation. Own id/span because this reason is specific
              to THIS button, unlike the shared course-write-gate sentence. */}
          {!syllabusTargetResolution.ok && (
            <span id="cc-syllabus-target-reason" className={styles.ccBarLabel} style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
              {syllabusTargetResolution.reason}
            </span>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              if (!courseWriteGate.allowed) return;
              onGenerateSyllabus();
            }}
            disabled={busy || syllabusButtonsBusy !== ""}
            aria-disabled={courseWriteGate.allowed ? undefined : "true"}
            aria-describedby={courseWriteGate.allowed ? undefined : "cc-course-write-reason"}
            sx={{ opacity: courseWriteGate.allowed ? 1 : 0.55 }}
            title={courseWriteGate.allowed ? "Generate the course syllabus from its template and attach it to Canvas" : undefined}
          >
            {syllabusButtonsBusy === "syllabus" ? "Generating…" : "Generate syllabus"}
          </Button>
          {/* Hidden - only opened programmatically when no syllabus template
              is resolvable (AC B2-1/B2-3); the visible affordance is the
              "Generate syllabus" button above, not this input. */}
          <input
            ref={syllabusTemplateFileInputRef}
            type="file"
            accept=".docx"
            onChange={onSyllabusTemplateFileChange}
            style={{ display: "none" }}
          />
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Rubrics</span>
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => {
              onRubricBuilderTrigger(e.currentTarget);
              setRubricBuilder({ assignments: [] });
            }}
          >
            New
          </Button>
          <TextField
            select
            size="small"
            sx={{ maxWidth: 180 }}
            value={editRubricId}
            disabled={rubrics.length === 0}
            onChange={(e) => setEditRubricId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Rubric to edit"
          >
            <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Edit…"}</MenuItem>
            {rubrics.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.title}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            disabled={editRubricId === ""}
            onClick={(e) => {
              if (editRubricId === "") return;
              onRubricBuilderTrigger(e.currentTarget);
              setRubricBuilder({ assignments: [], editRubricId: Number(editRubricId) });
            }}
          >
            Edit
          </Button>
        </div>
      </div>
    </>
  );
}
