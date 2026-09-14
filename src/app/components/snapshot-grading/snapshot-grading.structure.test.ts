import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// THE WIRING WAVE'S OWN REACHABILITY CANARY (docs/snapshot-grading-
// acceptance-criteria.md section 5, X5/X6). Copies module-deck-capture's own
// precedent (module-deck-capture.structure.test.ts) almost exactly: a panel
// can ship fully built and completely UNREACHABLE, or reachable right up
// until a reload silently drops it back to "record" because the recView
// union and its SEPARATE localStorage restore guard are two lists nothing
// forces to move together. Every assertion below was sabotage-checked while
// this file was written - see the report for both sides of that check.

const RECORDING_TAB_PATH = path.resolve(process.cwd(), "src/app/components/RecordingTab.tsx");
const recordingTabSource = fs.readFileSync(RECORDING_TAB_PATH, "utf-8");

const SNAPSHOT_GRADING_DIR = path.resolve(process.cwd(), "src/app/components/snapshot-grading");

describe("SnapshotGradingPanel is actually mounted by RecordingTab (reachability, entry point a)", () => {
  it("RecordingTab.tsx imports the default export from ./snapshot-grading/SnapshotGradingPanel", () => {
    expect(recordingTabSource).toMatch(
      /import SnapshotGradingPanel from "\.\/snapshot-grading\/SnapshotGradingPanel"/
    );
  });

  it("RecordingTab.tsx actually renders <SnapshotGradingPanel - an import alone proves nothing", () => {
    expect(recordingTabSource).toMatch(/<SnapshotGradingPanel\b/);
  });

  it('the rendered panel receives active={active && recView === "snapgrade"} - the same always-mounted, display:none-toggled idiom every sibling inner view uses, never unmounted on tab switch', () => {
    expect(recordingTabSource).toMatch(/<SnapshotGradingPanel active=\{active && recView === "snapgrade"\}/);
  });
});

describe('"snapgrade" is wired into BOTH the recView union AND the SEPARATE restore guard (the trap)', () => {
  it('"snapgrade" is a member of the recView useState union type', () => {
    // Anchor on the union literal's own line - deliberately NOT a bare
    // `source.includes('"snapgrade"')` check, which the restore guard's own
    // occurrence would also satisfy and could never fail independently of
    // it.
    const unionLine = recordingTabSource
      .split("\n")
      .find((line) => line.includes('"record" | "discussions" | "speed"'));
    expect(unionLine, "expected to find the recView union type's own line in RecordingTab.tsx").toBeTruthy();
    expect(unionLine).toMatch(/"snapgrade"/);
  });

  it('"snapgrade" is a member of the SEPARATE localStorage restore guard\'s v === chain (the actual trap: this can be missing while the test above still passes)', () => {
    // Isolate JUST the restore-guard block - from its own
    // `localStorage.getItem("ta-rec-view")` read to its own closing
    // `: "record";` fallback - so this cannot be satisfied by the union
    // line above happening to contain the same literal.
    const guardStart = recordingTabSource.indexOf('localStorage.getItem("ta-rec-view")');
    expect(guardStart, "expected to find the restore guard's own localStorage read").toBeGreaterThan(-1);
    const guardEnd = recordingTabSource.indexOf(': "record";', guardStart);
    expect(guardEnd, "expected to find the restore guard's own closing fallback").toBeGreaterThan(-1);
    const guardBlock = recordingTabSource.slice(guardStart, guardEnd);
    expect(guardBlock).toMatch(/v === "snapgrade"/);
  });

  it("the inner-view tab strip includes a snapgrade entry, so the view is reachable by more than a reload or a launch event", () => {
    expect(recordingTabSource).toMatch(/\["snapgrade",\s*"[^"]+"\]/);
  });
});

describe('"snapgrade" is a member of the RecordingLaunchView union AND the RECORDING_LAUNCH_VIEWS runtime validator (src/lib/recording-launch.ts)', () => {
  const recordingLaunchSource = fs.readFileSync(path.resolve(process.cwd(), "src/lib/recording-launch.ts"), "utf-8");

  it('"snapgrade" is in the RecordingLaunchView union type', () => {
    expect(recordingLaunchSource).toMatch(/export type RecordingLaunchView =[\s\S]*?"snapgrade"[\s\S]*?;/);
  });

  it('"snapgrade" is in the RECORDING_LAUNCH_VIEWS runtime array - the array is the actual validator, the union is only the type', () => {
    const arrayMatch = recordingLaunchSource.match(/const RECORDING_LAUNCH_VIEWS[\s\S]*?\];/);
    expect(arrayMatch, "expected to find the RECORDING_LAUNCH_VIEWS array literal").toBeTruthy();
    expect(arrayMatch![0]).toMatch(/"snapgrade"/);
  });
});

// ---------------------------------------------------------------------------
// X4: this directory's own ta-snap-* key canary. recording-split.structure
// .test.ts's exact-set canary scans only src/app/components/recording/ plus
// RecordingTab.tsx, and does NOT reach this directory - so without this
// block, a persisted key landing here would be invisible to every existing
// gate in this repo. Exact-set (not merely ordinal). H1-D deliberately
// persists ONE new field, the instructor-authored grading-instructions text
// (ta-snap-grading-instructions) - unlike rubric/assignment text, which U10
// still keeps out of localStorage for the same sensitivity reason as before.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WAVE 5, A7c: "the snap path calls no server action" from wave 4 extends to
// "the read/grade actions are called ONLY from a click handler, never a
// useEffect". GradingRecordingPanel.tsx:475-487 is the shape this must never
// copy: a useEffect that fires a server action the moment some piece of
// state crosses a threshold, with no button in the path. This test isolates
// every useEffect BLOCK in SnapshotGradingPanel.tsx (bracket-counting from
// each "useEffect(" to its own matching close) and asserts neither
// snapshotReadBatchAction nor snapshotGradeAction is called from inside one.
// ---------------------------------------------------------------------------

describe("no auto-drain effect (A7c): the read/grade actions are reachable ONLY from a click handler", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");
  // Backlog 3.5's line-budget extraction (Ruling B35-9, amended) moved
  // handleGrade - and its snapshotGradeAction call - out of the panel into
  // its own hook file, so this file's own scan needs to cover it too, or the
  // whole "calls both actions somewhere" assertion would go dark rather than
  // red the moment the extraction happened.
  const hookPath = path.join(SNAPSHOT_GRADING_DIR, "useSnapshotGrade.ts");
  const hookSource = fs.readFileSync(hookPath, "utf-8");

  function extractEffectBodies(source: string): string[] {
    const bodies: string[] = [];
    let searchFrom = 0;
    for (;;) {
      const start = source.indexOf("useEffect(", searchFrom);
      if (start === -1) break;
      let depth = 0;
      let i = start + "useEffect(".length - 1; // sit on the opening "("
      let end = -1;
      for (; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) break;
      bodies.push(source.slice(start, end + 1));
      searchFrom = end + 1;
    }
    return bodies;
  }

  it("finds at least two useEffect blocks in the panel - a scan over none proves nothing", () => {
    expect(extractEffectBodies(panelSource).length).toBeGreaterThanOrEqual(2);
  });

  it("calls both actions somewhere - snapshotReadBatchAction in the panel, snapshotGradeAction in the extracted grade hook - a check that neither is called anywhere proves nothing", () => {
    expect(panelSource).toMatch(/snapshotReadBatchAction\(/);
    expect(hookSource).toMatch(/snapshotGradeAction\(/);
  });

  it("no useEffect block in the panel calls snapshotReadBatchAction or snapshotGradeAction", () => {
    const effectBodies = extractEffectBodies(panelSource);
    for (const body of effectBodies) {
      expect(body).not.toMatch(/snapshotReadBatchAction\(/);
      expect(body).not.toMatch(/snapshotGradeAction\(/);
    }
  });

  it("the extracted grade hook contains no useEffect at all - snapshotGradeAction is reachable only through the handleGrade it returns, never auto-fired", () => {
    expect(hookSource).not.toMatch(/useEffect\(/);
  });

  it("handleRead and handleGrade are wired to onClick, not to a dependency-array effect", () => {
    expect(panelSource).toMatch(/onClick=\{\(\)\s*=>\s*void handleRead\(\)\}/);
    expect(panelSource).toMatch(/onClick=\{\(\)\s*=>\s*void handleGrade\(\)\}/);
  });
});

// ---------------------------------------------------------------------------
// MAJOR-1: A4d can be unwired with every other gate green. The directory-wide
// ta-snap-* key scan below reads only the non-test files in THIS directory,
// so it never sees the real localStorage.getItem/setItem calls, which live
// in assessment-shared/useAssessmentRowStore.ts. Deleting the
// useAssessmentRowStore call from the panel (persistence silently stops)
// would leave tsc, lint, every other test, and the build all green without
// this block.
// ---------------------------------------------------------------------------

describe("A4d: SnapshotGradingPanel is actually wired to useAssessmentRowStore for ta-snap-table (the real persistence call the directory key scan above cannot see)", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");
  const storePath = path.resolve(process.cwd(), "src/app/components/assessment-shared/useAssessmentRowStore.ts");
  const storeSource = fs.readFileSync(storePath, "utf-8");

  it('SnapshotGradingPanel.tsx declares const STORAGE_KEY_TABLE = "ta-snap-table"', () => {
    expect(panelSource).toMatch(/const STORAGE_KEY_TABLE = "ta-snap-table";/);
  });

  it("SnapshotGradingPanel.tsx actually calls useAssessmentRowStore<SnapshotAssessmentRow>(STORAGE_KEY_TABLE, snapshotRowCodec, ...) - declaring the key literal alone proves nothing", () => {
    expect(panelSource).toMatch(
      /useAssessmentRowStore<SnapshotAssessmentRow>\(\s*STORAGE_KEY_TABLE,\s*snapshotRowCodec/
    );
  });

  it("useAssessmentRowStore.ts passes its STORAGE_KEY_TABLE parameter through to both localStorage.getItem and localStorage.setItem", () => {
    expect(storeSource).toMatch(/localStorage\.getItem\(STORAGE_KEY_TABLE\)/);
    expect(storeSource).toMatch(/localStorage\.setItem\(\s*STORAGE_KEY_TABLE,/);
  });
});

describe("directory-wide ta-snap-* key exact-set canary (this directory has no canary anywhere else)", () => {
  const files = fs.readdirSync(SNAPSHOT_GRADING_DIR);
  const nonTestFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));

  it("finds more than 3 non-test files in this directory - a scan over an empty or renamed directory proves nothing", () => {
    expect(nonTestFiles.length).toBeGreaterThan(3);
  });

  const combinedSource = nonTestFiles
    .map((f) => fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, f), "utf-8"))
    .join("\n");

  const keys = combinedSource.match(/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g) ?? [];
  const distinctKeys = Array.from(new Set(keys)).sort();

  it("finds at least one ta-snap-* key across every non-test file in this directory - a check over nothing proves nothing", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("finds exactly the expected ta-snap-* key set (the armed-role toggle, H1-D's instructor grading-instructions field, and the completed-assessment table; U10 keeps shot bytes and rubric/assignment text out of localStorage)", () => {
    expect(distinctKeys).toEqual(["ta-snap-armed-role", "ta-snap-grading-instructions", "ta-snap-table"]);
  });

  it("ta-snap-armed-role is wired to both a read and a write", () => {
    expect(combinedSource).toMatch(/localStorage\.getItem\(\s*ARMED_ROLE_KEY\s*\)/);
    expect(combinedSource).toMatch(/localStorage\.setItem\(\s*ARMED_ROLE_KEY\s*,/);
  });

  it("H1-D: ta-snap-grading-instructions is wired to both a read and a write - a field that reaches this directory's source but is never actually read from or written to storage would still pass the exact-set check above", () => {
    expect(combinedSource).toMatch(/localStorage\.getItem\(\s*INSTRUCTOR_INSTRUCTIONS_KEY\s*\)/);
    expect(combinedSource).toMatch(/localStorage\.setItem\(\s*INSTRUCTOR_INSTRUCTIONS_KEY\s*,/);
  });
});

// ---------------------------------------------------------------------------
// FINAL FIX WAVE: the "don't grade a screenshot of the rubric modal itself"
// paste guard's correctness lives entirely in ANOTHER component's markup -
// it is true only because ModalShell.tsx emits aria-modal="true" on the open
// modal's div, which the guard checks for. Nothing before this test asserted
// that fact. If ModalShell ever moves to role="dialog" alone (dropping
// aria-modal), the guard becomes a silent no-op and rubric screenshots start
// filing themselves as shots behind an open modal - every other gate stays
// green. This was run against a deliberately broken ModalShell.tsx (the
// attribute value changed to aria-modal="false") and observed red before
// being restored byte-identical; see this wave's report for the failing
// output.
// ---------------------------------------------------------------------------

describe("ModalShell actually emits aria-modal=\"true\" (the fact the snapshot paste guard depends on)", () => {
  const modalShellPath = path.resolve(process.cwd(), "src/app/components/ui/ModalShell.tsx");
  const modalShellSource = fs.readFileSync(modalShellPath, "utf-8");

  it('ModalShell.tsx contains aria-modal="true"', () => {
    expect(modalShellSource).toContain('aria-modal="true"');
  });
});

// ---------------------------------------------------------------------------
// Backlog 3.5 (scratchpad/b35-rulings.md, Ruling B35-15). The staleness
// guard's pass condition, split at the `await` so it cannot be satisfied by
// deleting either half (round 1's single "every setState is guarded"
// assertion COULD be satisfied by deleting the pre-await reset, which
// reintroduces Ruling B35-1's exact danger). Two SEPARATE assertions on the
// SAME extracted `seedConfirmedAreas` body.
// ---------------------------------------------------------------------------

describe("seedConfirmedAreas's staleness guard, split at the await (Ruling B35-15)", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");

  const start = panelSource.indexOf("const seedConfirmedAreas = useCallback(async (text: string) => {");
  const end = panelSource.indexOf("}, []);", start);
  const body = start > -1 && end > -1 ? panelSource.slice(start, end) : "";

  it("finds seedConfirmedAreas's own function body - a check over an empty string proves nothing", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(body.length).toBeGreaterThan(0);
  });

  it("Assertion A: the PRE-await reset (both setConfirmedRubricAreas(null) and setConfirmedRubricAreasError(null)) is present and appears BEFORE the await", () => {
    const awaitIndex = body.indexOf("await snapshotParseRubricAction(");
    const resetAreasIndex = body.indexOf("setConfirmedRubricAreas(null)");
    const resetErrorIndex = body.indexOf("setConfirmedRubricAreasError(null)");
    expect(awaitIndex).toBeGreaterThan(-1);
    expect(resetAreasIndex).toBeGreaterThan(-1);
    expect(resetErrorIndex).toBeGreaterThan(-1);
    expect(resetAreasIndex).toBeLessThan(awaitIndex);
    expect(resetErrorIndex).toBeLessThan(awaitIndex);
  });

  it("Assertion B: the two POST-await setState calls are each preceded, after the await, by the request-id staleness guard", () => {
    const awaitIndex = body.indexOf("await snapshotParseRubricAction(");
    const guardIndex = body.indexOf(
      "isStaleParseResult(requestId, parseRequestIdRef.current)",
      awaitIndex
    );
    const setAreasIndex = body.indexOf("setConfirmedRubricAreas(result.areas)", awaitIndex);
    const setErrorIndex = body.indexOf("setConfirmedRubricAreasError(result.error)", awaitIndex);
    expect(guardIndex).toBeGreaterThan(awaitIndex);
    expect(setAreasIndex).toBeGreaterThan(guardIndex);
    expect(setErrorIndex).toBeGreaterThan(guardIndex);
  });
});

// ---------------------------------------------------------------------------
// Backlog 3.5 (Ruling B35-1). The confirmed-areas list resets EXACTLY at the
// rubric-replace onSubmit site, and deliberately SURVIVES Next student.
// ---------------------------------------------------------------------------

describe("confirmedRubricAreas resets ONLY at the rubric-replace onSubmit site (Ruling B35-1)", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");

  it("the rubric-replace onSubmit body contains BOTH setPinnedRubricAreas(null) and a seedConfirmedAreas( call", () => {
    const start = panelSource.indexOf("onSubmit={(text) => {");
    const end = panelSource.indexOf("setRubricModalOpen(false);", start);
    expect(start, "expected to find the rubric-replace onSubmit body").toBeGreaterThan(-1);
    expect(end, "expected to find its own setRubricModalOpen(false) close").toBeGreaterThan(start);
    const body = panelSource.slice(start, end);
    expect(body).toMatch(/setPinnedRubricAreas\(null\)/);
    expect(body).toMatch(/seedConfirmedAreas\(/);
  });

  it("handleNextStudentConfirm's body contains NEITHER setConfirmedRubricAreas nor setConfirmedRubricAreasError - the confirmed list survives Next student", () => {
    const start = panelSource.indexOf("const handleNextStudentConfirm = useCallback(() => {");
    const end = panelSource.indexOf("}, [clearPerStudentShots, announce, sessionRowsRef]);", start);
    expect(start, "expected to find handleNextStudentConfirm's own body").toBeGreaterThan(-1);
    expect(end, "expected to find its own closing dependency array").toBeGreaterThan(start);
    const body = panelSource.slice(start, end);
    expect(body).not.toMatch(/setConfirmedRubricAreas\(/);
    expect(body).not.toMatch(/setConfirmedRubricAreasError\(/);
  });
});

// ---------------------------------------------------------------------------
// Backlog 3.5 (Ruling B35-20). The delete-not-guard assertion, narrowed to
// the import and the live call (comment-stripped) so the REWRITTEN doc
// comments in snapshot-grade.ts (which explain what USED to happen there, in
// prose, and legitimately still mention the identifier by name) do not fail
// this check - only an import or a live call would.
// ---------------------------------------------------------------------------

describe("snapshot-grade.ts no longer imports or calls extractRubricCriteria (Ruling B35-20)", () => {
  const actionPath = path.resolve(process.cwd(), "src/app/actions/snapshot-grade.ts");
  const actionSource = fs.readFileSync(actionPath, "utf-8");

  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  }

  it("the doc comments still mention extractRubricCriteria by name (proving the file was not simply gutted, and that the check below is meaningful)", () => {
    expect(actionSource).toMatch(/extractRubricCriteria/);
  });

  it("no import statement in this file names extractRubricCriteria", () => {
    const importLines = actionSource.split("\n").filter((line) => /^\s*import\b/.test(line));
    for (const line of importLines) {
      expect(line).not.toMatch(/extractRubricCriteria/);
    }
  });

  it("comment-stripped, the file contains no LIVE CALL extractRubricCriteria(", () => {
    const stripped = stripComments(actionSource);
    expect(stripped).not.toMatch(/extractRubricCriteria\(/);
  });
});
