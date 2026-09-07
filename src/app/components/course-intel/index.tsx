"use client";

// Course Intel - A TEXTBOX, AND NOTHING ELSE (D24 of
// docs/course-student-intelligence-acceptance-criteria.md).
//
// THE PICKER IS GONE, and its absence is the feature rather than a
// simplification. With a picker, the two questions the owner actually asks are
// impossible to type: "what courses have had the least amount of items turned
// in late" is about all of them, and picking one course first is exactly the
// thing they are asking the tool to work out. So the question carries its own
// scope - src/lib/course-intel/course-scope.ts resolves a course name against
// the instructor's own course list, prefers the term currently in session when
// the same course runs in several, and refuses WITH the terms shown when it
// cannot tell.
//
// WHICH MEANS THE ANSWER HAS TO SAY WHICH COURSES IT USED. With nothing on
// screen recording a choice, the coverage block in CourseIntelAnswer.tsx is
// the only thing that tells the instructor what the question resolved to - and
// D24e requires it for a second, sharper reason: a ranking over five courses
// that silently covered three is not a partial answer, it is a confident wrong
// one.
//
// vitest here is node-env and collects only src/**/*.test.ts, so no component
// in this feature is ever rendered by a test - every visual and keyboard claim
// in these comments is a claim about the source, verified by reading.
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import TabHeader from "../TabHeader";
import CourseIntelAnswer from "./CourseIntelAnswer";
import CourseIntelHistory from "./CourseIntelHistory";
import { useCourseIntel } from "./useCourseIntel";
import pageStyles from "../../page.module.css";
import styles from "./course-intel.module.css";

export default function CourseIntelTab() {
  const {
    question,
    setQuestion,
    asking,
    statusText,
    askError,
    askRefusal,
    lastAnswer,
    ask,
    historyEntries,
    courseNames,
    historyLoading,
    historyError,
    historyOpen,
    toggleHistoryOpen,
    deletingHistoryId,
    deleteHistoryEntry,
    clearingHistory,
    clearHistory,
  } = useCourseIntel();

  return (
    <>
      <TabHeader
        eyebrow="Course Intel"
        title="Course Intel"
        subtitle="Ask about one course or about all of them - name a course in the question, or leave it out to cover every course."
      />

      <div className={styles.askSection}>
        {/* D14: a static, always-visible disclosure line immediately above the
            Ask box - in the muted hint style the knowledge panel's own scope
            line uses (never an alert style, which would misrepresent a normal
            fact as a problem). No dismiss control, no `ta-` flag for "has seen
            this", and the Ask button below is NOT gated behind an "I
            understand" click - this is disclosure, not consent (D14's own
            correction to this feature's original AC9). Equally true on the
            hundredth question as the first, so it is rendered unconditionally. */}
        <p className={pageStyles.fieldHint} style={{ margin: 0 }}>
          Asking a question here sends the discussion posts, messages and grades of whichever courses the question covers -
          or, where there is no Canvas connection, the work you recorded in this browser - to a third-party AI provider to
          generate the answer. Course names and student names are never sent.
        </p>

        <div className={styles.askRow}>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            placeholder="What students are struggling in Ethical Hacking? What courses have had the least amount of items turned in late?"
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
            disabled={asking}
          />
          <Button
            size="small"
            variant="contained"
            onClick={ask}
            disabled={asking || !question.trim()}
            loading={asking}
            loadingPosition="start"
          >
            Ask
          </Button>
        </div>

        <CourseIntelAnswer
          asking={asking}
          statusText={statusText}
          askError={askError}
          askRefusal={askRefusal}
          answer={lastAnswer}
        />
      </div>

      {/* REGRESSION.md entry 408d: every answer this tab produces is
          persisted, and until this component existed nothing ever read it
          back. See CourseIntelHistory.tsx's own header for what this reuses
          from KnowledgeOverviewHistory.tsx and what it deliberately does
          not. */}
      <CourseIntelHistory
        entries={historyEntries}
        courseNames={courseNames}
        loading={historyLoading}
        open={historyOpen}
        onToggleOpen={toggleHistoryOpen}
        deletingId={deletingHistoryId}
        onDelete={deleteHistoryEntry}
        clearing={clearingHistory}
        onClearAll={clearHistory}
        error={historyError}
      />
    </>
  );
}
