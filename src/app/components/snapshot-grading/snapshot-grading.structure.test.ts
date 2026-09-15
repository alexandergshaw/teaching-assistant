import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { SNAPSHOT_ROLE_LABELS } from "./snapshot-shot";

// Shared by every canary below that asserts a call or a registration is
// LIVE (not merely mentioned). A bare regex over raw source text matches
// equally well inside `//` or `/* */` comments, so a call that is commented
// out - dead code - would still satisfy a raw-source match. Comment-stripping
// first closes that hole. Kept single-line-safe (no /s or /gs dotAll flag,
// which vitest accepts but tsc rejects with TS1501).
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

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

describe("no auto-drain effect (A7c): the read/grade/OCR actions are reachable ONLY from a click handler or a chord", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");
  // Backlog 3.5's line-budget extraction (Ruling B35-9, amended) moved
  // handleGrade - and its snapshotGradeAction call - out of the panel into
  // its own hook file, so this file's own scan needs to cover it too, or the
  // whole "calls both actions somewhere" assertion would go dark rather than
  // red the moment the extraction happened.
  const hookPath = path.join(SNAPSHOT_GRADING_DIR, "useSnapshotGrade.ts");
  const hookSource = fs.readFileSync(hookPath, "utf-8");
  // N14 WAVE 2 (Ruling N14-15/n14-architecture.md section 7): this plan moved
  // the keydown dispatch into useSnapshotKeyboardShortcuts.ts and the new OCR
  // call into useSnapshotRubricCapture.ts - a construction-based rewrite that
  // kept scanning only the two hardcoded paths above would be blind to a
  // useEffect in either new file. Generalized below to every non-test
  // .ts/.tsx file in this directory, so a future file needs no fifth name.
  const allNonTestFiles = fs
    .readdirSync(SNAPSHOT_GRADING_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const allSources = allNonTestFiles.map((f) => ({
    file: f,
    source: fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, f), "utf-8"),
  }));
  const rubricCaptureHookSource = fs.readFileSync(
    path.join(SNAPSHOT_GRADING_DIR, "useSnapshotRubricCapture.ts"),
    "utf-8"
  );

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
    // Comment-stripped: same class of hole as the N14 keyboard canary - a
    // commented-out call would otherwise still satisfy a raw-source match.
    expect(stripComments(panelSource)).toMatch(/snapshotReadBatchAction\(/);
    expect(stripComments(hookSource)).toMatch(/snapshotGradeAction\(/);
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

  // N14 WAVE 2 (Ruling N14-15): the OCR call is a NEW dedicated action
  // (snapshotTranscribeRubricAction), reachable only through Alt+R's
  // captureAndTranscribe, never a useEffect.
  it("calls snapshotTranscribeRubricAction somewhere in the rubric-capture hook - a check that it is called nowhere proves nothing", () => {
    expect(stripComments(rubricCaptureHookSource)).toMatch(/snapshotTranscribeRubricAction\(/);
  });

  it("the rubric-capture hook contains no useEffect at all - snapshotTranscribeRubricAction is reachable only through captureAndTranscribe, never auto-fired", () => {
    expect(rubricCaptureHookSource).not.toMatch(/useEffect\(/);
  });

  it("BY CONSTRUCTION: no useEffect block in ANY non-test file in this directory calls snapshotReadBatchAction, snapshotGradeAction, or snapshotTranscribeRubricAction - generalized so a future file cannot pass this by not being on a hardcoded list (Ruling N14-15)", () => {
    for (const { file, source } of allSources) {
      const effectBodies = extractEffectBodies(source);
      for (const body of effectBodies) {
        expect(body, `${file} has a useEffect calling snapshotReadBatchAction`).not.toMatch(/snapshotReadBatchAction\(/);
        expect(body, `${file} has a useEffect calling snapshotGradeAction`).not.toMatch(/snapshotGradeAction\(/);
        expect(body, `${file} has a useEffect calling snapshotTranscribeRubricAction`).not.toMatch(
          /snapshotTranscribeRubricAction\(/
        );
      }
    }
  });

  it("useSnapshotKeyboardShortcuts.ts's own keydown effect never calls an action directly - only through the callback parameters it receives (captureAndTranscribe is passed in as onCaptureRubric, never imported)", () => {
    const keyboardHookSource = fs.readFileSync(
      path.join(SNAPSHOT_GRADING_DIR, "useSnapshotKeyboardShortcuts.ts"),
      "utf-8"
    );
    expect(stripComments(keyboardHookSource)).not.toMatch(/snapshotReadBatchAction\(/);
    expect(stripComments(keyboardHookSource)).not.toMatch(/snapshotGradeAction\(/);
    expect(stripComments(keyboardHookSource)).not.toMatch(/snapshotTranscribeRubricAction\(/);
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
    // Comment-stripped: same class of hole as the N14 keyboard canary.
    expect(stripComments(panelSource)).toMatch(
      /useAssessmentRowStore<SnapshotAssessmentRow>\(\s*STORAGE_KEY_TABLE,\s*snapshotRowCodec/
    );
  });

  it("useAssessmentRowStore.ts passes its STORAGE_KEY_TABLE parameter through to both localStorage.getItem and localStorage.setItem", () => {
    // Comment-stripped: same class of hole as the N14 keyboard canary.
    const strippedStoreSource = stripComments(storeSource);
    expect(strippedStoreSource).toMatch(/localStorage\.getItem\(STORAGE_KEY_TABLE\)/);
    expect(strippedStoreSource).toMatch(/localStorage\.setItem\(\s*STORAGE_KEY_TABLE,/);
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

  // Comment-stripped once for the wiring checks below: same class of hole as
  // the N14 keyboard canary - a commented-out getItem/setItem call would
  // still satisfy a raw-source match. The exact-set key scan above
  // deliberately keeps scanning raw combinedSource (it is inventorying every
  // key mention, including documentation, not asserting liveness).
  const strippedCombinedSource = stripComments(combinedSource);

  it("ta-snap-armed-role is wired to both a read and a write", () => {
    expect(strippedCombinedSource).toMatch(/localStorage\.getItem\(\s*ARMED_ROLE_KEY\s*\)/);
    expect(strippedCombinedSource).toMatch(/localStorage\.setItem\(\s*ARMED_ROLE_KEY\s*,/);
  });

  it("H1-D: ta-snap-grading-instructions is wired to both a read and a write - a field that reaches this directory's source but is never actually read from or written to storage would still pass the exact-set check above", () => {
    expect(strippedCombinedSource).toMatch(/localStorage\.getItem\(\s*INSTRUCTOR_INSTRUCTIONS_KEY\s*\)/);
    expect(strippedCombinedSource).toMatch(/localStorage\.setItem\(\s*INSTRUCTOR_INSTRUCTIONS_KEY\s*,/);
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
// Backlog 3.5 / N14 WAVE 2 (Ruling B35-1, amended per Ruling N14-10). The
// confirmed-areas list resets EXACTLY inside applyReviewedRubricText (the
// ONE producer both the rubric-replace modal and the Alt+R review call), and
// deliberately SURVIVES Next student.
//
// THE CONSTRUCTION (Ruling N14-10): the old version of this test sliced the
// modal's own onSubmit body and regex-matched two of the three obligations
// there - a slice-based check a SECOND producer elsewhere in the directory
// would never touch, so it would pass while being covered by nothing. The
// rewrite instead (1) locates applyReviewedRubricText's OWN body and asserts
// all three identifiers appear inside it, and (2) asserts setRubricText( has
// EXACTLY ONE call site across this directory's combined non-test source,
// and that its one occurrence falls inside applyReviewedRubricText's body -
// an assertion a third producer, anywhere in this directory, cannot pass by
// merely not being on a list.
// ---------------------------------------------------------------------------

describe("confirmedRubricAreas resets ONLY inside applyReviewedRubricText, the one producer (Ruling B35-1/N14-10)", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");
  const hookPath = path.join(SNAPSHOT_GRADING_DIR, "useSnapshotRubricCapture.ts");
  const hookSource = fs.readFileSync(hookPath, "utf-8");

  const producerStart = hookSource.indexOf("const applyReviewedRubricText = useCallback(");
  const producerEnd = hookSource.indexOf("[setRubricText, setPinnedRubricAreas, seedConfirmedAreas]", producerStart);
  const producerBody = producerStart > -1 && producerEnd > -1 ? hookSource.slice(producerStart, producerEnd) : "";

  it("finds applyReviewedRubricText's own body - a check over an empty string proves nothing", () => {
    expect(producerStart).toBeGreaterThan(-1);
    expect(producerEnd).toBeGreaterThan(producerStart);
    expect(producerBody.length).toBeGreaterThan(0);
  });

  it("applyReviewedRubricText's body contains all three obligations: setRubricText(, setPinnedRubricAreas(, seedConfirmedAreas(", () => {
    expect(producerBody).toMatch(/setRubricText\(/);
    expect(producerBody).toMatch(/setPinnedRubricAreas\(/);
    expect(producerBody).toMatch(/seedConfirmedAreas\(/);
  });

  it("setRubricText( has exactly ONE call site across this directory's combined non-test source, and it is inside applyReviewedRubricText - a third producer cannot pass this", () => {
    const files = fs.readdirSync(SNAPSHOT_GRADING_DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
    const combined = files.map((f) => fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, f), "utf-8")).join("\n");
    const stripped = stripComments(combined);
    const callSites = stripped.match(/setRubricText\(/g) ?? [];
    // Exactly two textual occurrences are expected: the useState declaration
    // itself ("setRubricText") appears once as a plain identifier (no call
    // parens) and is not matched by this regex at all; the only CALL is
    // inside applyReviewedRubricText.
    expect(callSites.length).toBe(1);
    expect(stripComments(producerBody)).toMatch(/setRubricText\(/);
  });

  it("the rubric-replace onSubmit body calls applyReviewedRubricText, never the three obligations directly", () => {
    const start = panelSource.indexOf("onSubmit={(text) => {");
    const end = panelSource.indexOf("setRubricModalOpen(false);", start);
    expect(start, "expected to find the rubric-replace onSubmit body").toBeGreaterThan(-1);
    expect(end, "expected to find its own setRubricModalOpen(false) close").toBeGreaterThan(start);
    const body = panelSource.slice(start, end);
    expect(body).toMatch(/applyReviewedRubricText\(/);
    expect(body).not.toMatch(/setRubricText\(/);
    expect(body).not.toMatch(/setPinnedRubricAreas\(/);
    expect(body).not.toMatch(/seedConfirmedAreas\(/);
  });

  it("handleNextStudentConfirm's body contains NEITHER setConfirmedRubricAreas nor setConfirmedRubricAreasError - the confirmed list survives Next student", () => {
    const start = panelSource.indexOf("const handleNextStudentConfirm = useCallback(() => {");
    const end = panelSource.indexOf("}, [clearPerStudentShots, announce]);", start);
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

// ---------------------------------------------------------------------------
// N14 WAVE 1 (Ruling N14-17): the keydown-wiring reachability canary. Wave 1
// moves the live window keydown listener out of SnapshotGradingPanel.tsx and
// into useSnapshotKeyboardShortcuts.ts. If the panel's own call into that
// hook is omitted, mistyped, or later deleted by an unrelated edit, the
// ENTIRE keyboard layer dies - every bare binding (s/n/1-6) alongside the
// new Alt+G chord - while tsc, lint, the build's compile line, and every
// other test (including the pure matcher tests in snapshot-keys.test.ts)
// stay green, because nothing else in this repo asserts a keydown listener
// is actually attached to `window`. Mirrors the existing A4d canary's own
// two-part technique (import/declare is not enough; the actual wiring call
// must be present too).
// ---------------------------------------------------------------------------

describe("N14 wave 1: SnapshotGradingPanel is actually wired to useSnapshotKeyboardShortcuts (the reachability canary for the whole keyboard layer)", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");
  const hookPath = path.join(SNAPSHOT_GRADING_DIR, "useSnapshotKeyboardShortcuts.ts");
  const hookSource = fs.readFileSync(hookPath, "utf-8");

  it("SnapshotGradingPanel.tsx imports useSnapshotKeyboardShortcuts from ./useSnapshotKeyboardShortcuts", () => {
    expect(panelSource).toMatch(
      /import\s*\{\s*useSnapshotKeyboardShortcuts\s*\}\s*from\s*"\.\/useSnapshotKeyboardShortcuts"/
    );
  });

  it("SnapshotGradingPanel.tsx actually CALLS useSnapshotKeyboardShortcuts( - an import alone proves nothing", () => {
    // Comment-stripped: a commented-out call would still satisfy a raw-
    // source match and silently pass while the hook is never invoked.
    expect(stripComments(panelSource)).toMatch(/useSnapshotKeyboardShortcuts\(\s*\{/);
  });

  it("useSnapshotKeyboardShortcuts.ts itself registers the window keydown listener - the hook existing and being imported proves nothing if its own body never wires anything", () => {
    // Comment-stripped: this is the exact hole a sabotage check found - a
    // commented-out `window.addEventListener("keydown", ...)` line, with the
    // matching removeEventListener left intact, matched this assertion on
    // raw source and passed while the whole keyboard layer was dead.
    const strippedHookSource = stripComments(hookSource);
    expect(strippedHookSource).toMatch(/window\.addEventListener\(\s*"keydown"/);
    expect(strippedHookSource).toMatch(/window\.removeEventListener\(\s*"keydown"/);
  });
});

// ---------------------------------------------------------------------------
// N14 WAVE 1 (Ruling N14-16): the hint-text pass condition. The old wording
// applied its "no Ctrl, Alt, or Cmd/Win" qualifier to the WHOLE bound-key
// list; adding Alt+G without rewriting it would ship a sentence that
// contradicts itself on screen the instant this wave lands, with nothing in
// this repo asserting on that string before now. This test pins the new
// two-clause shape and cross-checks the bare-key role labels against
// SNAPSHOT_ROLE_LABELS as data (not re-typed prose), so a role rename would
// fail this test rather than silently drift from the on-screen hint.
// ---------------------------------------------------------------------------

describe("N14 wave 1/2: SnapshotCaptureBar's keyboard hint is rewritten, not appended to (Ruling N14-16)", () => {
  const barPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotCaptureBar.tsx");
  const barSource = fs.readFileSync(barPath, "utf-8");

  it("does not apply the old 'no Ctrl, Alt, or Cmd/Win key held' qualifier to the whole bound-key list", () => {
    expect(barSource).not.toMatch(/Keyboard \(no Ctrl, Alt, or Cmd\/Win key held\)/);
  });

  it("the bare-key clause still states its own no-modifier qualifier", () => {
    expect(barSource).toMatch(/none of these take Ctrl, Alt, or Cmd\/Win/);
  });

  it("every SNAPSHOT_ROLE_LABELS value still appears in the hint text (the bare 1-6 role list, checked as data)", () => {
    for (const label of Object.values(SNAPSHOT_ROLE_LABELS)) {
      expect(barSource).toContain(label);
    }
  });

  it("Alt+G is documented as arming Next Student, with its own exclusive-Alt qualifier separate from the bare keys' clause", () => {
    expect(barSource).toMatch(/Alt\+G also arms\s+Next Student/);
    expect(barSource).toMatch(/Alt alone, not Ctrl\+Alt \(AltGr\) or Cmd\/Win/);
  });

  // N14 WAVE 2 (Ruling N14-16, extended - not a second, competing test).
  it("Alt+R is documented as capturing/transcribing/reviewing the rubric, with its own exclusive-Alt qualifier", () => {
    expect(barSource).toMatch(/Alt\+R captures/);
    // Both chords state the SAME exclusivity qualifier text; two occurrences
    // are expected once Alt+R's own clause exists.
    const qualifierMatches = barSource.match(/Alt alone, not Ctrl\+Alt \(AltGr\) or Cmd\/Win/g) ?? [];
    expect(qualifierMatches.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// N14 WAVE 2 (Rulings N14-14.4/N14-17). "First in DOM order" is necessary,
// NOT sufficient - orderTabbables (modalFocus.ts:94-99) filters disabled/
// hidden elements out and sorts a positive tabIndex ahead of natural order
// BEFORE DOM order is even consulted, so a Confirm rendered first still
// loses first-tabbable if it is disabled, or if some other element carries a
// stray positive tabIndex. All three checks read the same file.
// ---------------------------------------------------------------------------

describe("SnapshotRubricCaptureReview.tsx: Confirm is first in DOM order AND cannot lose first-tabbable to a disabled/positive-tabIndex element (Ruling N14-17)", () => {
  const reviewPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotRubricCaptureReview.tsx");
  const reviewSource = fs.readFileSync(reviewPath, "utf-8");

  it("Confirm's own button text appears textually BEFORE any other button-shaped element in this file's JSX", () => {
    const confirmIndex = reviewSource.indexOf("Confirm - use this transcript as the rubric");
    expect(confirmIndex, "expected to find the Confirm button's own text").toBeGreaterThan(-1);
    const firstButtonTagIndex = reviewSource.indexOf("<Button");
    expect(firstButtonTagIndex, "expected to find at least one <Button").toBeGreaterThan(-1);
    // The Confirm button's own <Button ...> opening tag must be that FIRST
    // <Button occurrence - not merely that its text appears somewhere before
    // some other button's text, which a differently-ordered JSX could still
    // satisfy by accident.
    const confirmButtonTagIndex = reviewSource.lastIndexOf("<Button", confirmIndex);
    expect(confirmButtonTagIndex).toBe(firstButtonTagIndex);
  });

  it("the Confirm button carries no disabled or loading prop, anywhere in this file - Criterion 3 point 5 requires review even of a blank transcript", () => {
    const confirmStart = reviewSource.indexOf("<Button variant=\"contained\"");
    const confirmEnd = reviewSource.indexOf("</Button>", confirmStart);
    expect(confirmStart, "expected to find the Confirm button's own opening tag").toBeGreaterThan(-1);
    expect(confirmEnd).toBeGreaterThan(confirmStart);
    const confirmMarkup = reviewSource.slice(confirmStart, confirmEnd);
    expect(confirmMarkup).not.toMatch(/\bdisabled=/);
    expect(confirmMarkup).not.toMatch(/\bloading=/);
  });

  it("no element anywhere in this file carries a positive tabIndex - only 0 or -1 (natural order / non-tabbable), matching ModalShell.tsx's own convention", () => {
    const tabIndexValues = [...reviewSource.matchAll(/tabIndex=\{(-?\d+)\}/g)].map((m) => Number(m[1]));
    for (const value of tabIndexValues) {
      expect([0, -1]).toContain(value);
    }
  });

  it("the captured image is actually shown (Ruling N14-11) - a review surface with no image to check the transcript against is silent loss", () => {
    expect(reviewSource).toMatch(/<img\b/);
    expect(reviewSource).toMatch(/data:image\/jpeg;base64,\$\{base64\}/);
  });
});

describe("snapshot-grade.ts no longer imports or calls extractRubricCriteria (Ruling B35-20)", () => {
  const actionPath = path.resolve(process.cwd(), "src/app/actions/snapshot-grade.ts");
  const actionSource = fs.readFileSync(actionPath, "utf-8");

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
