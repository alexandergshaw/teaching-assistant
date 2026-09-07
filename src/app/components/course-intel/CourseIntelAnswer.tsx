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
      return pageStyles.ghBadgeNeutral;
  }
}

export interface CourseIntelAnswerProps {
  asking: boolean;
  /** "" when not asking; one of D17's two phase strings ("Gathering Canvas
   * data..." / "Asking the AI...") otherwise. */
  statusText: string;
  askError: string | null;
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
export default function CourseIntelAnswer({ asking, statusText, askError, answer }: CourseIntelAnswerProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="false" className={styles.status}>
      {asking && <span className={pageStyles.fieldHint}>{statusText}</span>}

      {!asking && askError && (
        <p className={pageStyles.error} role="alert">
          {askError}
        </p>
      )}

      {!asking && !askError && answer && (
        <div className={styles.answerBlock}>
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
                  These figures come straight from Canvas grades and submissions, not from the AI&apos;s own judgment. This is
                  not a diagnosis - it never explains why a number looks the way it does.
                </p>
              </>
            ) : (
              // D15's exact empty-case prose, no strip, no list.
              <p className={pageStyles.fieldHint}>
                Based on the available Canvas data, no student in this course currently shows a concern signal - missing or
                late work, a low course score, or an ungraded backlog.
              </p>
            ))}

          {/* AC6/D6: what was left out is stated, never silently dropped.
              Each omission's own `.detail` string is already the full
              sentence (server-authored, per-source or per-student per D6) -
              this list only renders it, it never composes one. */}
          {answer.omissions.length > 0 && (
            <ul className={styles.omissionsList}>
              {answer.omissions.map((omission, i) => (
                <li key={i} className={pageStyles.fieldHint}>
                  {omission.detail}
                </li>
              ))}
            </ul>
          )}

          {/* D2/D9: every answer is rebuilt from Canvas fresh, per question -
              there is no cached corpus and therefore no staleness to manage
              (see useCourseIntel.ts's own header). Stating that plainly here
              is what makes the absence of a "generated N minutes ago" badge
              a deliberate choice rather than an omission. */}
          <span className={pageStyles.ghMeta}>Canvas data gathered fresh for this question - nothing here is cached.</span>
        </div>
      )}
    </div>
  );
}
