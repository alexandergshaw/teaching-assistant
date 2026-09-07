"use client";

// The ask-answer-signals sequence for Course Intel (D15/D16/D17 of
// docs/course-student-intelligence-acceptance-criteria.md). Split out of
// index.tsx as its own component purely for the same reason
// RepoGradesControls.tsx was pulled out of repo-grades/index.tsx - it is the
// part of this view with a clear seam and no state of its own, everything it
// renders arrives as props from useCourseIntel.ts.
//
// vitest here is node-env and collects only src/**/*.test.ts, so no
// component in this feature is ever rendered by a test - every visual and
// keyboard claim in this file's comments is a claim about the source,
// verified by reading, exactly like the aesthetics-pass acceptance criteria
// already states for this whole codebase.

import { markdownToHtml } from "@/lib/markdown";
import type { ConcernSignalKind } from "@/lib/course-intel/types";
import type { ResolvedCourseIntelAnswer } from "./useCourseIntel";
import pageStyles from "../../page.module.css";
import styles from "./course-intel.module.css";

// D15: the strip below is built ENTIRELY from the typed ConcernSignal data
// useCourseIntel.ts already resolved from the server's own typed
// ConcernRow[] - this component never parses a signal out of
// `answer.answerMarkdown`, and never invents one. That is what makes "every
// named student traces to a concrete signal" a RENDERING GUARANTEE rather
// than a hope about the model's honesty: this component cannot display a
// named student's badges without that student already having a row here,
// and that row's shape came from typed server data, never from prose.

/**
 * D15: a score is not a verdict on its own, and neither is the instructor's
 * OWN ungraded backlog - both render neutral. Missing work, late work, and a
 * long activity gap are the three signals actually about the student's own
 * pattern, so those get the warning tone. "insufficient-data" is explicitly
 * NOT a concern (its own doc comment in types.ts: "a first-class row so such
 * a student is REPORTED rather than omitted"), so it reads neutral too -
 * this function is exhaustive over ConcernSignalKind, so a new signal kind
 * added to that union without a case here is a compile error, never a
 * silent fallthrough. Reuses the existing `.ghBadge*` classes
 * (page.module.css) rather than inventing a colour, so no new entry is
 * needed in focusRing.wiring.test.ts's contrast oracle.
 */
function signalBadgeClass(kind: ConcernSignalKind): string {
  switch (kind) {
    case "missing-work":
    case "late-work":
    case "no-recent-activity":
      return pageStyles.ghBadgeWarning;
    case "low-score":
    case "ungraded-backlog":
    case "insufficient-data":
    // The four D23 additions are all neutral, and that is a judgement rather
    // than a default. None of them is a verdict about the student's own
    // failure: a resubmission is MORE work, an unknown submission time is our
    // gap and not theirs, the ungraded gap is the instructor's own backlog,
    // and activity after a gap is outright positive. Colouring any of them as
    // a warning would read as an accusation for doing the right thing.
    case "resubmission":
    case "unknown-submission-time":
    case "ungraded-gap":
    case "recent-activity-after-gap":
      return pageStyles.ghBadgeNeutral;
  }
}

export interface CourseIntelAnswerProps {
  asking: boolean;
  /** "" when not asking; one of D17's two phase strings ("Gathering course
   * data..." / "Asking the AI...") otherwise. */
  statusText: string;
  askError: string | null;
  /**
   * A REFUSAL, not a failure: the question named a student who matches two
   * roster entries, or named more than one student. Nothing was sent to the
   * model and nothing went wrong, so it renders in the muted hint style
   * rather than the error style - and the question is still in the box.
   */
  askRefusal: string | null;
  answer: ResolvedCourseIntelAnswer | null;
}

/**
 * ONE role="status" aria-live="polite" region for the whole ask-answer-
 * signals sequence (D17) - never a second competing region anywhere in this
 * feature. MUI's `loading` prop on the Ask button (index.tsx) disables it
 * but sets no aria-busy of its own (this repo's own verified MUI 9.0.1
 * facts), so this text is the ONLY thing announcing the in-flight state to
 * assistive tech - a sighted instructor also sees it, since it is a normal
 * visible paragraph, not a screen-reader-only one.
 *
 * `aria-atomic="false"` (matching KnowledgeOverviewPanel.tsx's identical
 * region) so a screen reader announces only what actually changed on each
 * update, not the whole block every time.
 */
export default function CourseIntelAnswer({ asking, statusText, askError, askRefusal, answer }: CourseIntelAnswerProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="false" className={styles.status}>
      {asking && <span className={pageStyles.fieldHint}>{statusText}</span>}

      {!asking && askError && (
        <p className={pageStyles.error} role="alert">
          {askError}
        </p>
      )}

      {!asking && !askError && askRefusal && <p className={pageStyles.fieldHint}>{askRefusal}</p>}

      {!asking && !askError && !askRefusal && answer && (
        <div className={styles.answerBlock}>
          {/* D20e: THE MODE LINE. Rendered above the prose, always, whenever
              this answer was not built from a live LMS - and it carries WHICH
              of the three unavailable states applies plus what that means for
              the answer, because "Canvas is not connected for this course, so
              this answer uses only the work you recorded here" is actionable
              and "offline mode" is not.

              PERMANENT AND NON-DISMISSIBLE, copying the content tab's own
              live-then-export note (ContentTab.tsx, a bare <p> with no close
              control and no timer): it is equally true on the hundredth
              question as on the first, and it is re-derived from the server's
              own `connection` on every answer rather than remembered.

              NOT an alert style. This is a FACT about the answer, not a
              problem with it - an export-only course is a normal kind of
              course here - so it uses the same muted hint style as the
              disclosure line above the Ask box. The string itself is composed
              server-side by describeLmsConnection, so the browser and the
              server can never disagree about which state applied. */}
          {answer.connectionNote && (
            <p className={`${pageStyles.fieldHint} ${styles.modeLine}`}>{answer.connectionNote}</p>
          )}

          {/* D24e: THE COVERAGE BLOCK. Rendered WHENEVER there is an answer,
              not only when something failed, and code-authored on the server
              rather than left to the model to mention.

              Two jobs, and both are load-bearing. With the course picker gone
              (index.tsx) this is the only thing that tells the instructor
              WHICH course a question resolved to. And a ranking asserts by its
              grammar that everything was considered, so a five-course question
              that reached three courses must show that on the face of the
              answer - the model is also instructed not to write a bare
              superlative in that case, but an instruction is not a guarantee
              and this is rendered from typed server data either way. */}
          {answer.coverageLines.length > 0 && (
            <div className={styles.coverageBlock}>
              <p className={pageStyles.ghMeta}>
                {answer.courses.length > 1
                  ? `This answer covers ${answer.courses.length} courses:`
                  : "This answer covers:"}
              </p>
              <ul className={styles.omissionsList}>
                {answer.coverageLines.map((line, i) => (
                  <li key={i} className={pageStyles.fieldHint}>
                    {line}
                  </li>
                ))}
              </ul>
              {!answer.coverageComplete && (
                <p className={pageStyles.fieldHint}>
                  These courses were not all read the same way, so they cannot be ranked against each other. Treat any
                  comparison as covering only the courses listed above with the same source.
                </p>
              )}
            </div>
          )}
          {/* markdownToHtml, never markdown-lite (S13) - this text quotes or
              summarises student-authored content, and this function is the
              only renderer in this codebase that escapes before emitting and
              allowlists link schemes. answer.answerMarkdown already has every
              "S<index>" marker resolved to a real, disambiguated display name
              by useCourseIntel.ts - the model itself never saw a name. */}
          <div className={styles.answerProse} dangerouslySetInnerHTML={{ __html: markdownToHtml(answer.answerMarkdown) }} />

          {answer.showConcernStrip &&
            (answer.concernRows.length > 0 ? (
              <>
                <div className={styles.signalStrip}>
                  {answer.concernRows.map((row) => (
                    <div key={row.studentIndex} className={styles.signalRow}>
                      {/* The course is ALREADY IN `displayName` when the
                          answer spans more than one (useCourseIntel.ts's
                          buildNameByIndex appends it there, because the prose
                          above has no column to put it in). A second chip here
                          would print it twice on every row. */}
                      <span className={styles.signalName}>{row.displayName}</span>
                      <div className={styles.signalBadges}>
                        {/* Real text nodes, never colour or an icon alone
                            (D15) - each badge's own label string already
                            names the fact ("3 of 7 assignments missing"),
                            never re-derived from `.value` here. */}
                        {row.signals.map((signal, i) => (
                          <span key={i} className={`${pageStyles.ghBadge} ${signalBadgeClass(signal.kind)}`}>
                            {signal.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className={pageStyles.fieldHint}>
                  {answer.courses.length > 1
                    ? "These figures were computed from each course's own records, as listed above, not from the AI's own judgment."
                    : answer.connection.state === "live"
                      ? "These figures come straight from Canvas grades and submissions, not from the AI's own judgment."
                      : "These figures were computed from the work you recorded for this course, not from the AI's own judgment."}{" "}
                  This is not a diagnosis - it never explains why a number looks the way it does.
                </p>
              </>
            ) : (
              // D15's exact empty-case prose, no strip, no list.
              <p className={pageStyles.fieldHint}>
                {answer.courses.length > 1
                  ? "No student in the courses listed above currently shows a concern signal - missing or late work, a low course score, or an ungraded backlog."
                  : answer.connection.state === "live"
                    ? "Based on the available Canvas data, no student in this course currently shows a concern signal - missing or late work, a low course score, or an ungraded backlog."
                    : "Based on the work you recorded for this course, no student currently shows a concern signal. This checked only what is recorded here, not an LMS gradebook."}
              </p>
            ))}

          {/* AC6/D6: what was left out is stated, never silently dropped.
              Each string is already the full sentence - server-authored, from
              a live assembly's own omissions or from the offline path's
              coverage notes, merged into ONE list by useCourseIntel.ts so
              this component has no branch that could render one kind and
              forget the other. It only renders them; it never composes one. */}
          {answer.notes.length > 0 && (
            <ul className={styles.omissionsList}>
              {answer.notes.map((note, i) => (
                <li key={i} className={pageStyles.fieldHint}>
                  {note}
                </li>
              ))}
            </ul>
          )}

          {/* D1's receipt, made visible. The model was told to explain every
              row it was handed; a row it dropped is still on screen above,
              and this says so outright rather than leaving a shorter list to
              look entirely normal. */}
          {answer.unexplainedStudentIndices.length > 0 && (
            <p className={pageStyles.fieldHint}>
              The AI did not write about every student listed above. Their figures are still shown here.
            </p>
          )}

          {answer.persistError && (
            <p className={pageStyles.fieldHint}>
              This answer is on screen but was not saved to your history: {answer.persistError}
            </p>
          )}

          {/* D2/D9: every answer is rebuilt from Canvas fresh, per question -
              there is no cached corpus and therefore no staleness to manage
              (see useCourseIntel.ts's own header). Stating that plainly here
              is what makes the absence of a "generated N minutes ago" badge
              a deliberate choice rather than an omission. */}
          <span className={pageStyles.ghMeta}>
            {answer.connection.state === "live"
              ? "Canvas data gathered fresh for this question - nothing here is cached."
              : "Built fresh for this question from each course's own source - nothing here is cached."}
          </span>
        </div>
      )}
    </div>
  );
}
