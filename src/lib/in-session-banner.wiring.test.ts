import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// InSessionBanner.tsx is a React component - vitest here is node-env and
// collects only src/**/*.test.ts, so it is never rendered under test (see
// docs/aesthetics-pass-acceptance-criteria.md section 5's "Limits", and
// docs/REGRESSION.md entry 288/289's own "Limits" sections for this exact
// component). The behaviours this feature's own audit called highest-value
// (B1's storage-read safety, B7's retry-then-unavailable state, and a
// handful of the others) are therefore pinned here as SOURCE-TEXT checks,
// the same "wiring test" pattern this codebase already uses elsewhere for
// component behaviour a render-based test cannot reach (e.g.
// taskNoteIndicator.wiring.test.ts, GenerateFromSelectionSection.checkpoints
// .test.ts). Each assertion below was sabotage-checked by hand: the
// corresponding line in InSessionBanner.tsx was temporarily reverted/broken,
// this file was re-run and confirmed red, then the source was restored and
// this file re-run and confirmed green again.
const SOURCE = readFileSync(
  path.resolve(process.cwd(), "src/app/components/InSessionBanner.tsx"),
  "utf-8"
);

describe("InSessionBanner - B1: the localStorage read cannot white-screen the app", () => {
  it("wraps the localStorage.getItem call for the open/closed preference in its own try/catch, not left unwrapped in the useState initializer", () => {
    const initializerMatch = SOURCE.match(
      /const \[open, setOpen\] = useState<boolean>\(\(\) => \{[\s\S]*?\n {2}\}\);/
    );
    expect(initializerMatch).not.toBeNull();
    const initializer = initializerMatch![0];
    // The read must be inside a try block whose own catch clause follows it,
    // both within this one initializer.
    expect(initializer).toMatch(/try\s*\{[\s\S]*localStorage\.getItem\(STORAGE_KEY\)[\s\S]*\}\s*catch/);
  });

  it("defaults to expanded (true) on a storage exception, matching the 'nothing stored yet' default", () => {
    const initializerMatch = SOURCE.match(
      /const \[open, setOpen\] = useState<boolean>\(\(\) => \{[\s\S]*?\n {2}\}\);/
    );
    const initializer = initializerMatch![0];
    const catchBlock = initializer.match(/\}\s*catch[\s\S]*$/);
    expect(catchBlock).not.toBeNull();
    expect(catchBlock![0]).toMatch(/return true;/);
  });
});

describe("InSessionBanner - B7: a load failure retries exactly once, then (only then) admits it", () => {
  it("only sets `failed` on the RETRIED attempt, never on the first one", () => {
    // isRetry gates the branch that calls setFailed(true) - the first
    // (isRetry === false) attempt must fall through to the retry instead.
    expect(SOURCE).toMatch(/if \(isRetry\) \{[\s\S]{0,200}setFailed\(true\);/);
  });

  it("re-attempts the load exactly once after the first failure", () => {
    const attemptCalls = SOURCE.match(/attempt\(true\)/g) ?? [];
    // Exactly one recursive retry call site (the initial call is
    // attempt(false), a different literal).
    expect(attemptCalls.length).toBe(1);
    expect(SOURCE).toMatch(/attempt\(false\)/);
  });

  it("never calls setCourses from within the error branch - a failure (first or retried) leaves `courses` untouched", () => {
    const errorBranchMatch = SOURCE.match(/if \("error" in result\) \{[\s\S]*?\n {6}\}\n {6}setFailed\(false\);/);
    expect(errorBranchMatch).not.toBeNull();
    expect(errorBranchMatch![0]).not.toMatch(/setCourses/);
  });

  it("renders a distinct 'unavailable' row (not null, and not the normal chip strip) once `failed` is true", () => {
    expect(SOURCE).toMatch(/if \(failed\) \{/);
    expect(SOURCE).toMatch(/Course dates unavailable/);
    expect(SOURCE).toMatch(/onClick=\{handleManualRetry\}/);
  });
});

describe("InSessionBanner - B2: the term label no longer claims 'now'", () => {
  it("never renders the old, inaccurate 'In session now' wording", () => {
    expect(SOURCE).not.toMatch(/In session now/);
  });

  it("renders the corrected, term-scoped wording instead", () => {
    expect(SOURCE).toMatch(/Teaching this term/);
  });
});

describe("InSessionBanner - B4: an upcoming entry's truncation now eats the course name, not the date", () => {
  it("places the date span before the course-name span in DOM/source order", () => {
    const dateIndex = SOURCE.indexOf("styles.upcomingDate");
    const nameIndex = SOURCE.indexOf("styles.upcomingCourseName");
    expect(dateIndex).toBeGreaterThan(-1);
    expect(nameIndex).toBeGreaterThan(dateIndex);
  });

  it("gives the upcoming chip button a title attribute carrying the full text", () => {
    expect(SOURCE).toMatch(/title=\{fullText\}/);
  });
});

describe("InSessionBanner - B5: upcoming dates are listed before in-session courses", () => {
  it("renders the upcoming list's JSX block before the course list's JSX block", () => {
    const upcomingListIndex = SOURCE.indexOf("styles.upcomingList");
    const courseListIndex = SOURCE.indexOf("styles.courseList");
    expect(upcomingListIndex).toBeGreaterThan(-1);
    expect(courseListIndex).toBeGreaterThan(upcomingListIndex);
  });
});

describe("InSessionBanner - B3: the divider only appears when both zones are present", () => {
  it("guards the divider on both lists being non-empty", () => {
    expect(SOURCE).toMatch(/inSession\.length > 0 && upcoming\.length > 0 &&[\s\S]{0,40}styles\.divider/);
  });
});

describe("InSessionBanner - B6: the toggle carries the soonest upcoming entry, not a bare count", () => {
  it("calls summarizeUpcoming and renders its label/date rather than a bare 'Upcoming N' count", () => {
    expect(SOURCE).toMatch(/summarizeUpcoming\(upcoming, now\)/);
    expect(SOURCE).not.toMatch(/Upcoming\s*<span className=\{styles\.srOnly\}/);
  });
});

describe("InSessionBanner - B8: the upcoming-dates query opts into the lookback explicitly", () => {
  it("passes UPCOMING_LOOKBACK_DAYS to upcomingCourseDates rather than leaving it at the default", () => {
    expect(SOURCE).toMatch(
      /upcomingCourseDates\(underWay, startingSoon, now, UPCOMING_HORIZON_DAYS, UPCOMING_LOOKBACK_DAYS\)/
    );
  });
});

describe("InSessionBanner - B10: a stale upcoming click is no longer silent", () => {
  it("sets a visible/announced notice when resolveFocusedCourse fails, instead of doing nothing", () => {
    expect(SOURCE).toMatch(/setStaleClickNotice\(/);
    expect(SOURCE).toMatch(/aria-live="polite"/);
  });
});
