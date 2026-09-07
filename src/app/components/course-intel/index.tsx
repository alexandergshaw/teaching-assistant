"use client";

// Course Intel - a Manual subtab that answers questions about one course's
// students by joining their discussion replies, messages, and grades
// (docs/course-student-intelligence-acceptance-criteria.md, decisions
// D13-D17). A per-course tool with its own internal course picker, modeled
// directly on src/app/components/repo-grades/index.tsx - see
// useCourseIntel.ts for every piece of state and the (not-yet-existing)
// POST /api/course-intel/ask call this view drives.
//
// This wave is the navigation-shell + client UI only: the assembly and the
// model call are a wave 2 Route Handler (D3) that does not exist yet.
// Nothing in this file imports from it - useCourseIntel.ts calls it as a
// plain URL string and documents the wire contract it expects.
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import TabHeader from "../TabHeader";
import CourseIntelAnswer from "./CourseIntelAnswer";
import { useCourseIntel } from "./useCourseIntel";
import pageStyles from "../../page.module.css";
import styles from "./course-intel.module.css";

export default function CourseIntelTab() {
  const {
    courses,
    coursesLoading,
    coursesError,
    courseId,
    setCourseId,
    course,
    courseNotConfiguredReason,
    rosterLoading,
    rosterError,
    question,
    setQuestion,
    asking,
    statusText,
    askError,
    lastAnswer,
    ask,
  } = useCourseIntel();

  // The Ask section only makes sense once a real, configured course is
  // selected - matches repo-grades' own showRowDependentFields gate on its
  // sibling controls (RepoGradesControls.tsx).
  const canAsk = !!course && !courseNotConfiguredReason;

  return (
    <>
      <TabHeader
        eyebrow="Course Intel"
        title="Course Intel"
        subtitle="Ask AI about one course's discussion posts, messages, and grades - joined per student."
      />

      <div className={pageStyles.field}>
        <label htmlFor="course-intel-course">Course</label>
        <TextField
          select
          size="small"
          fullWidth
          id="course-intel-course"
          value={courseId}
          disabled={coursesLoading}
          onChange={(e) => setCourseId(e.target.value)}
        >
          <MenuItem value="">{coursesLoading ? "Loading courses..." : "Choose a course..."}</MenuItem>
          {courses.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        {coursesError && (
          <p className={pageStyles.error} role="alert">
            {coursesError}
          </p>
        )}
      </div>

      {course && courseNotConfiguredReason && (
        <p className={pageStyles.error} role="alert">
          {courseNotConfiguredReason}
        </p>
      )}

      {course && !courseNotConfiguredReason && rosterError && (
        <p className={pageStyles.error} role="alert">
          {rosterError}
        </p>
      )}

      {canAsk && (
        <div className={styles.askSection}>
          {/* D14: a static, always-visible disclosure line immediately above
              the Ask box - in the muted hint style the knowledge panel's own
              scope line uses (never an alert style, which would misrepresent
              a normal fact as a problem). No dismiss control, no `ta-` flag
              for "has seen this", and the Ask button below is NOT gated
              behind an "I understand" click - this is disclosure, not
              consent (D14's own correction to this feature's original AC9).
              Equally true on the hundredth question as the first, so it is
              rendered every time this section renders, unconditionally. */}
          <p className={pageStyles.fieldHint} style={{ margin: 0 }}>
            Asking a question here sends this course&apos;s discussion posts, messages, and grades to a third-party AI
            provider to generate the answer.
          </p>

          <div className={styles.askRow}>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              placeholder="What areas has Jordan asked about? How is Alex doing? Who are the students of concern?"
              value={question}
              // onKeyDown belongs on the top-level TextField prop (or
              // slotProps.input) - never slotProps.htmlInput, which would
              // silently kill Enter-to-send (this repo's own verified MUI
              // 9.0.1 trap).
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              onChange={(e) => setQuestion(e.target.value)}
              helperText="Press Enter to ask, Shift+Enter for a new line."
              disabled={asking || rosterLoading}
            />
            <Button
              size="small"
              variant="contained"
              onClick={ask}
              disabled={asking || rosterLoading || !question.trim()}
              loading={asking}
              loadingPosition="start"
            >
              Ask
            </Button>
          </div>

          {rosterLoading && (
            <p className={pageStyles.fieldHint} style={{ margin: 0 }}>
              Loading this course&apos;s roster...
            </p>
          )}

          <CourseIntelAnswer asking={asking} statusText={statusText} askError={askError} answer={lastAnswer} />
        </div>
      )}
    </>
  );
}
