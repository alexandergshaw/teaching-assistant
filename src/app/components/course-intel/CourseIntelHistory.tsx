"use client";

// Course Intel - the Q&A history reader (REGRESSION.md entry 408d, D8 of
// docs/course-student-intelligence-acceptance-criteria.md). Every answer
// this tab produces is persisted by src/lib/course-intel/history.ts through
// the ask route, and NOTHING READ IT BACK until this component existed - all
// five history actions in src/app/actions/course-intel.ts were referenced by
// zero components. D24 removed the course picker, so the ORIGINAL per-course
// readers (listCourseIntelAnswers/exportCourseIntelAnswers/
// clearCourseIntelAnswers) no longer have a courseId any caller here can
// supply; useCourseIntel.ts calls the ALL-SCOPES actions instead
// (getAllCourseIntelHistoryAction/clearAllCourseIntelHistoryAction/
// deleteCourseIntelAnswerAction) and this component only renders what it is
// handed - it never imports a server action or a Supabase client itself.
//
// MODELED ON src/app/components/knowledge/KnowledgeOverviewHistory.tsx - the
// pattern surveyed before writing this file. REUSED verbatim: the
// collapsible section shape (a heading wrapping a toggle button, never the
// reverse), ConfirmArmButtons for both the per-row delete and "Clear all"
// (never a hand-rolled second arm/confirm dialect), a role="status"
// consequence line rendered only while armed, and the shared .ghRow/
// .ghRowTop/.ghRowTitle/.ghActions/.ghMeta classes from page.module.css that
// KnowledgeOverviewHistory itself reuses rather than re-declares.
//
// DELIBERATELY NOT COPIED. KnowledgeOverviewHistory scopes its whole history
// list to ONE institution/page and resolves citations against that scope's
// own page list; this tab has no scope left to key off (D24: one textbox,
// every course), so instead EVERY ENTRY STATES ITS OWN SCOPE -
// describeCourseIntelHistoryScope below is this file's own addition, not a
// port of anything Knowledge has, because D24e requires it: a cross-course
// answer's coverage is part of the answer's meaning, never assumed from
// context the way a single fixed scope heading could assume it. Citation
// chips are also not reused - this feature has no citation concept at all.
//
// EXPORT IS A NEW CONTROL, not a copy of one that already existed. Surveying
// KnowledgeOverviewHistory.tsx found no export button anywhere in that
// feature, and no exportScopeQuestions-shaped function in
// src/lib/knowledge-overview.ts either - Knowledge's own D8-shaped
// requirement was apparently never wired. This feature's OWN D8 explicitly
// requires one ("the honest answer to 'what do you hold about me' is that
// the instructor produces it themselves, and they cannot without one"), so
// it is built here rather than left as a fifth unreferenced action. It
// downloads the entries this component ALREADY HOLDS as props, oldest first
// (the chronological reading order D8 asks for) - never a second network
// round trip only to re-sort an array this browser already has in memory.
//
// vitest here is node-env and collects only src/**/*.test.ts, so no
// component in this feature is ever rendered by a test - every visual and
// keyboard claim in this file's comments is a claim about the source,
// verified by reading, matching every other file in this directory.

import { useState } from "react";
import Button from "@mui/material/Button";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { markdownToHtml } from "@/lib/markdown";
import type { CourseIntelHistoryEntry } from "@/lib/course-intel/history";
import { formatRelative } from "../../utils/time";
import pageStyles from "../../page.module.css";
import styles from "./course-intel.module.css";

/**
 * What one entry was scoped to, in the instructor's own vocabulary rather
 * than a course_hub id - D24e: "which courses it covered" is part of the
 * answer's meaning, not a footnote, and a raw uuid on screen would tell an
 * instructor nothing (the defect this whole component exists to fix).
 *
 * `courseNames` is keyed by EVERY course this user currently has (built from
 * listCourses in the action layer) - so its own key set doubles as "every
 * course that currently exists" for the "all of your courses" comparison
 * below, with no separate count to keep in sync and no risk of it drifting
 * from the actual course list.
 *
 * A course id this map does not recognise (deleted since the question was
 * asked) falls back to a stated, honest sentence rather than a blank or a
 * raw id - the same "state what is missing, never hide it" discipline
 * course-scope.ts and history.ts already apply elsewhere in this feature.
 */
export function describeCourseIntelHistoryScope(
  entry: Pick<CourseIntelHistoryEntry, "courseId" | "courseIds">,
  courseNames: Readonly<Record<string, string>>
): string {
  const nameFor = (id: string) => courseNames[id] ?? "a course no longer in your course list";

  if (entry.courseId !== null) {
    return nameFor(entry.courseId);
  }

  const ids = entry.courseIds;
  if (ids.length === 0) {
    // Unreachable while course_intel_answers_course_scope_check holds
    // (exactly one of courseId/courseIds is ever populated) - guarded rather
    // than assumed, since this renders rows a service-role client could in
    // principle hand back malformed.
    return "an unknown scope";
  }

  const knownIds = Object.keys(courseNames);
  const coversEveryKnownCourse =
    knownIds.length > 0 && ids.length === knownIds.length && knownIds.every((id) => ids.includes(id));
  if (coversEveryKnownCourse) {
    return `all ${ids.length} of your courses`;
  }

  return `${ids.length} courses: ${ids.map(nameFor).join(", ")}`;
}

/**
 * The export file's full text - every entry, OLDEST FIRST (the chronological
 * reading order D8 asks for: "what do you hold about me" reads as a record,
 * not a feed), plain text rather than markdown so it reads correctly in any
 * editor without a renderer. `entries` arrives newest-first (matching the
 * on-screen list and listAllCourseIntelAnswers's own ordering), so this
 * reverses a copy rather than mutating the array the list below is rendering
 * from.
 */
export function formatCourseIntelHistoryExport(
  entries: readonly CourseIntelHistoryEntry[],
  courseNames: Readonly<Record<string, string>>
): string {
  const chronological = [...entries].reverse();
  return chronological
    .map((entry) =>
      [
        `Scope: ${describeCourseIntelHistoryScope(entry, courseNames)}`,
        `Asked: ${entry.createdAt}`,
        `Question: ${entry.question}`,
        "Answer:",
        entry.answerMarkdown,
      ].join("\n")
    )
    .join("\n\n---\n\n");
}

/** A plain client-side download - no server round trip, no confirm step
 *  (non-destructive: it reads, it never deletes). Mirrors the
 *  URL.createObjectURL + temporary-anchor pattern already used elsewhere in
 *  this codebase (FilesTab.tsx, GradingResults.tsx, and others) rather than
 *  inventing a second one. */
function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface CourseIntelHistoryProps {
  entries: readonly CourseIntelHistoryEntry[];
  /** course_hub id -> name, for every course this user currently has - see
   *  describeCourseIntelHistoryScope's own doc comment for why the full list
   *  travels even for courses no entry references. */
  courseNames: Readonly<Record<string, string>>;
  loading: boolean;
  open: boolean;
  onToggleOpen: () => void;
  deletingId: string | null;
  onDelete: (id: string) => void;
  clearing: boolean;
  onClearAll: () => void;
  error: string | null;
}

export default function CourseIntelHistory({
  entries,
  courseNames,
  loading,
  open,
  onToggleOpen,
  deletingId,
  onDelete,
  clearing,
  onClearAll,
  error,
}: CourseIntelHistoryProps) {
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);

  const clearConsequenceId = "course-intel-history-clear-consequence";

  return (
    <div className={styles.historySection}>
      {/* Heading WRAPS the toggle button, never the reverse - mirrors
          KnowledgeOverviewHistory.tsx's identical comment: h2 is heading
          content, not the phrasing content <button> is restricted to. */}
      <h2 className={styles.historyToggleHeading}>
        <button type="button" className={styles.historyToggle} aria-expanded={open} onClick={onToggleOpen}>
          <span className={open ? styles.historyChevronOpen : styles.historyChevron} aria-hidden="true" />
          History {entries.length > 0 ? `(${entries.length})` : ""}
        </button>
      </h2>

      {open && (
        <div className={styles.historyBody}>
          {error && (
            <p className={pageStyles.error} role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <p className={pageStyles.fieldHint} style={{ margin: 0 }}>
              Loading your question history...
            </p>
          ) : entries.length === 0 ? (
            <p className={pageStyles.fieldHint} style={{ margin: 0 }}>
              No questions asked yet - answers you ask for in this tab will be listed here, across every course.
            </p>
          ) : (
            <>
              <div className={styles.historyHeaderRow}>
                <Button
                  size="small"
                  variant="text"
                  onClick={() =>
                    downloadTextFile("course-intel-history.txt", formatCourseIntelHistoryExport(entries, courseNames))
                  }
                >
                  Export
                </Button>
                <ConfirmArmButtons
                  armed={clearArmed}
                  idleLabel="Clear history"
                  confirmLabel="Confirm clear"
                  tone="danger"
                  idleVariant="text"
                  loading={clearing}
                  loadingLabel="Clearing…"
                  onArm={() => setClearArmed(true)}
                  onConfirm={() => {
                    setClearArmed(false);
                    onClearAll();
                  }}
                  onCancel={() => setClearArmed(false)}
                  consequenceId={clearConsequenceId}
                  idleAriaLabel="Clear all question history"
                  confirmAriaLabel="Confirm clearing all question history"
                />
              </div>
              {clearArmed && (
                <p id={clearConsequenceId} role="status" aria-live="polite" className={pageStyles.fieldHint} style={{ margin: 0 }}>
                  Deletes all {entries.length} question{entries.length === 1 ? "" : "s"} in this history, across every
                  course. This cannot be undone.
                </p>
              )}

              {entries.map((entry) => {
                const questionLabel = entry.question.trim() || "Untitled question";
                const rowDeleteConsequenceId = `course-intel-history-delete-consequence-${entry.id}`;
                return (
                  <div key={entry.id} className={pageStyles.ghRow}>
                    <div className={pageStyles.ghRowTop}>
                      <div className={pageStyles.ghRowTitle}>{entry.question}</div>
                      <div className={pageStyles.ghActions}>
                        <ConfirmArmButtons
                          armed={armedDeleteId === entry.id}
                          idleLabel="Delete"
                          confirmLabel="Confirm delete"
                          tone="danger"
                          idleVariant="text"
                          loading={deletingId === entry.id}
                          loadingLabel="Deleting…"
                          onArm={() => setArmedDeleteId(entry.id)}
                          onConfirm={() => {
                            setArmedDeleteId(null);
                            onDelete(entry.id);
                          }}
                          onCancel={() => setArmedDeleteId(null)}
                          consequenceId={rowDeleteConsequenceId}
                          idleAriaLabel={`Delete question "${questionLabel}"`}
                          confirmAriaLabel={`Confirm delete for question "${questionLabel}"`}
                        />
                      </div>
                    </div>
                    {armedDeleteId === entry.id && (
                      <p id={rowDeleteConsequenceId} role="status" aria-live="polite" className={pageStyles.fieldHint} style={{ margin: 0 }}>
                        Deletes this question and answer from history. This cannot be undone.
                      </p>
                    )}
                    {/* D24e: which course(s) this entry covered, stated in
                        names rather than left implicit - see
                        describeCourseIntelHistoryScope's own doc comment. */}
                    <p className={pageStyles.ghMeta} style={{ margin: 0 }}>
                      Scoped to {describeCourseIntelHistoryScope(entry, courseNames)}
                    </p>
                    {/* markdownToHtml, never markdown-lite - the same
                        renderer CourseIntelAnswer.tsx uses for the live
                        answer, reusing its own .answerProse rule set from
                        course-intel.module.css rather than a second copy of
                        the same h1-h6/p/ul/code rules. */}
                    <div
                      className={styles.answerProse}
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(entry.answerMarkdown) }}
                    />
                    <span className={pageStyles.ghMeta}>Asked {formatRelative(entry.createdAt)}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
