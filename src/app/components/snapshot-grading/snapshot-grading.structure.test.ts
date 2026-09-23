import { describe, it, expect, vi } from "vitest";

import * as fs from "fs";
import * as path from "path";
import { SNAPSHOT_ROLE_LABELS } from "./snapshot-shot";

// L15: this file walks a real directory tree / reads many real files.
// vitest's 5000ms default testTimeout treats that as slow-but-fine when
// run alone, and as a false timeout under concurrent `npm test` load from
// sibling agents (measured: the slowest single top-level it() here runs
// well under 1s alone). Raised to the repo's existing slow-test
// convention of 30_000, already used by canvas-client-boundary.
// transitive.test.ts and runtime-import-graph.test.ts - this changes
// nothing about what any test asserts.
vi.setConfig({ testTimeout: 30_000 });

// Shared by every canary below that asserts a call or registration is LIVE
// (not merely mentioned) - a bare regex over raw text matches inside a
// comment too. Single-line safe (no /s or /gs, tsc rejects that as TS1501).
// BLOCKER B fix: split on /\r?\n/, never bare "\n" - "." does not match "\r",
// so on a CRLF working tree (`git ls-files --eol`: snapshot-row.ts and
// siblings are i/lf w/crlf; core.autocrlf=true with no .gitattributes) the
// old `.split("\n")` left a trailing "\r" that made `.replace(/\/\/.*$/,"")`
// stop one char short of any trailing "//".
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// CANARY (BLOCKER B), built with String.fromCharCode(13) (never a \r escape
// in source text - Write/Edit materialize that as a literal character).
// Sabotage proof: reverting to `.split("\n")` makes this fail.
describe("stripComments handles CRLF line endings (BLOCKER B canary)", () => {
  const CR = String.fromCharCode(13);

  it("strips both a trailing and a whole-line // comment on CRLF-terminated lines", () => {
    const fixture = `const x = 1;${CR}\nconst y = 2; // trailing comment must go${CR}\n// whole-line comment must go${CR}\nconst z = 3;`;
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("trailing comment must go");
    expect(stripped).not.toContain("whole-line comment must go");
    expect(stripped).toContain("const y = 2;");
    expect(stripped).toContain("const z = 3;");
  });
});

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

// N15c remediation round 3 (BLOCKER 1): the A7c/AC10 auto-fire reachability
// block (extractEffectBodies/extractCallbackBody, the BY CONSTRUCTION gate,
// the AC10 construction, and the five-name call-site pin) moved to its own
// file - snapshot-autofire.structure.test.ts - so this file could add the
// round-3 fixes below without crossing the 1000-line ceiling.

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

  it("finds exactly the expected ta-snap-* key set (the armed-role toggle, N15c's auto-grade-armed checkbox, H1-D's instructor grading-instructions field, and the completed-assessment table; U10 keeps shot bytes and rubric/assignment text out of localStorage)", () => {
    expect(distinctKeys).toEqual([
      "ta-snap-armed-role",
      "ta-snap-auto-grade-armed",
      "ta-snap-grading-instructions",
      "ta-snap-table",
    ]);
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

  it("N15c: ta-snap-auto-grade-armed is wired to both a read and a write - AC 14/15", () => {
    expect(strippedCombinedSource).toMatch(/localStorage\.getItem\(\s*AUTO_GRADE_ARMED_KEY\s*\)/);
    expect(strippedCombinedSource).toMatch(/localStorage\.setItem\(\s*AUTO_GRADE_ARMED_KEY\s*,/);
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
    const end = panelSource.indexOf("}, [clearPerStudentShots, announce, clearPendingAutoGrade]);", start);
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

// ---------------------------------------------------------------------------
// N15c AC 9 (Ruling D1/D3): frozen call-site counts, decl vs. call
// distinguished - the exact mechanism this design's own check ran
// (rungate-v3.js) against a simulated build, now applied to the real
// directory. Any count moving without a same-commit, human-reviewed bump is
// an unreviewed new path to a paid call, or the trigger silently
// disconnected from an entry point (the measured "wired to one of three"
// evasion).
// ---------------------------------------------------------------------------

describe("N15c AC 9: frozen call-site counts across this directory, decl vs. call distinguished", () => {
  const nonTestFiles = fs
    .readdirSync(SNAPSHOT_GRADING_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const combined = stripComments(
    nonTestFiles.map((f) => fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, f), "utf-8")).join("\n")
  );

  function counts(identifier: string): { total: number; decl: number; calls: number } {
    const total = (combined.match(new RegExp(`${identifier}\\(`, "g")) ?? []).length;
    const decl = (combined.match(new RegExp(`function ${identifier}\\(`, "g")) ?? []).length;
    return { total, decl, calls: total - decl };
  }

  it("handleGrade( is 2 total / 0 decl / 2 calls (the button's onClick, and the auto-wrapper's void handleGrade(shotsForGrade)) - never a `function handleGrade(` form", () => {
    expect(counts("handleGrade")).toEqual({ total: 2, decl: 0, calls: 2 });
  });

  it("snapshotGradeAction( is 1 total / 0 decl / 1 call - inside useSnapshotGrade.ts's handleGrade only", () => {
    expect(counts("snapshotGradeAction")).toEqual({ total: 1, decl: 0, calls: 1 });
  });

  it("isGradeEligible( is 3 total / 1 decl / 2 calls - the `export function isGradeEligible(` declaration itself matches its own call regex (freeze at 3, not 2): 1 decl + 2 real calls (the Grade button's disabled expression, and decideAutoGrade's internal composition)", () => {
    expect(counts("isGradeEligible")).toEqual({ total: 3, decl: 1, calls: 2 });
  });

  it("decideAutoGrade( is 2 total / 1 decl / 1 call - 1 decl + 1 call (inside useSnapshotAutoGrade.ts's attemptFire)", () => {
    expect(counts("decideAutoGrade")).toEqual({ total: 2, decl: 1, calls: 1 });
  });

  it("countSubmissionArrivals( is 2 total / 1 decl / 1 call - 1 decl + 1 call (composed internally by decideAutoGrade; no external caller needs it directly)", () => {
    expect(counts("countSubmissionArrivals")).toEqual({ total: 2, decl: 1, calls: 1 });
  });

  it("triggerAutoGradeIfDue( is 3 total / 0 decl / 3 calls - handleSnap, handleFiles, handleZipFile; never a `function` form (it is a hook's returned callback)", () => {
    expect(counts("triggerAutoGradeIfDue")).toEqual({ total: 3, decl: 0, calls: 3 });
  });
});

// ---------------------------------------------------------------------------
// N15c AC 11 (Wiring A, instruction 4): closes the hardcoded-arrivals gap.
// Every triggerAutoGradeIfDue( call site's first argument must be the
// literal identifier `added`, and the full call must read
// triggerAutoGradeIfDue(added, shotsIncludingArrivals(shots, added)) - a
// fabricated/hardcoded array at a call site is exactly the measured evasion
// this pins against. The trigger call must also sit OUTSIDE every `for (`
// block in each handler - a call inside the loop would fire once per file/
// image instead of once per handler invocation.
//
// BLOCKER 2 fix (round 3): the old per-handler slice ended at
// `stripped.indexOf("}, [", declIdx)`. handleSnap closes as `}, [captureFrame,
// ...]);` on one line and slices right; handleFiles and handleZipFile close
// as `},\n    [encodeFile, ...]` - that literal never appears - so both
// slices ran past their own function into the paste useEffect further down
// (measured: handleFiles' old slice contained 2 trigger call sites,
// handleZipFile's 1). This rewrite bounds each handler by brace-matching
// from its own `useCallback(` instead - never by a formatting-dependent
// literal - and checks EVERY `for (` in the body, not just the first.
// ---------------------------------------------------------------------------

describe("N15c AC 11 (Wiring A): every triggerAutoGradeIfDue( call site reads the full expected shape, outside any for( loop", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");
  const stripped = stripComments(panelSource);

  const EXPECTED_CALL = "triggerAutoGradeIfDue(added, shotsIncludingArrivals(shots, added));";

  // Duplicated (never imported from a sibling *.test.ts): brace-matches from
  // a callback's own opening `{` to its own matching close, throwing rather
  // than silently returning an empty/wrong slice if no brace is found.
  function extractCallbackBody(declText: string): string {
    const braceStart = declText.indexOf("{");
    if (braceStart === -1) throw new Error("extractCallbackBody: no opening brace found");
    let depth = 0;
    for (let i = braceStart; i < declText.length; i++) {
      if (declText[i] === "{") depth++;
      else if (declText[i] === "}" && --depth === 0) return declText.slice(braceStart + 1, i);
    }
    throw new Error("extractCallbackBody: found an opening { with no matching close");
  }

  it("the exact call literal appears 3 times (handleSnap, handleFiles, handleZipFile)", () => {
    const matches = stripped.split(EXPECTED_CALL).length - 1;
    expect(matches).toBe(3);
  });

  it("each of handleSnap/handleFiles/handleZipFile's own bodies contains the call, and it sits OUTSIDE every `for (` block in that body", () => {
    const handlerNames = ["handleSnap", "handleFiles", "handleZipFile"];
    for (const name of handlerNames) {
      const declIdx = stripped.indexOf(`const ${name} = useCallback(`);
      expect(declIdx, `expected to find ${name}'s own declaration`).toBeGreaterThan(-1);
      // Bound to this handler's OWN function-literal body via brace-matching
      // from its own useCallback( - correct regardless of how the
      // dependency array that follows happens to be formatted.
      const body = extractCallbackBody(stripped.slice(declIdx));
      const triggerIdx = body.indexOf("triggerAutoGradeIfDue(");
      expect(triggerIdx, `expected to find triggerAutoGradeIfDue( inside ${name}`).toBeGreaterThan(-1);

      // Every `for (` in this handler's body - not just the first - must
      // close before the trigger call (never contain it).
      for (let forIdx = body.indexOf("for ("); forIdx !== -1; forIdx = body.indexOf("for (", forIdx + 1)) {
        const loopBraceStart = body.indexOf("{", forIdx);
        let depth = 0;
        let i = loopBraceStart;
        let loopEnd = -1;
        for (; i < body.length; i++) {
          if (body[i] === "{") depth++;
          else if (body[i] === "}") {
            depth--;
            if (depth === 0) {
              loopEnd = i;
              break;
            }
          }
        }
        expect(loopEnd, `expected to find the matching close of ${name}'s own for( loop at index ${forIdx}`).toBeGreaterThan(-1);
        expect(
          triggerIdx < forIdx || triggerIdx > loopEnd,
          `triggerAutoGradeIfDue( in ${name} falls inside a for( loop spanning [${forIdx}, ${loopEnd}]`
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// N15c AC 17: the disclosure-copy pins. The panel's own paragraph, and
// SnapshotCaptureBar's disclosure paragraph, both used to state networking
// happens ONLY on Read/Grade/Alt+R - false the moment auto-fire exists.
// Instruction 8 (overriding the design's own third pin, which named
// SnapshotCaptureBar.tsx:118-124 - that clause makes no networking claim at
// all, so the criterion as originally written could not fail): the real
// amendment is that the "S to snap" clause states S can initiate an upload
// while auto-grade is armed.
//
// SHOULD-FIX 5 (round 3): the old pins scanned the whole 970-line panelSource
// UN-STRIPPED - measured: removing the real disclosure paragraph and adding
// one ordinary `// auto-grade... armed... automatically` comment elsewhere in
// the file still satisfied the first assertion. Every other liveness check
// in this file strips comments first; this rewrite does the same AND scopes
// each assertion to the disclosure element itself, not the whole file.
// ---------------------------------------------------------------------------

describe("N15c AC 17: the disclosure copy accounts for auto-grade (rewritten, not silently left claiming 'only' three actions)", () => {
  // A39 wave 3a-i moved this paragraph out of SnapshotGradingPanel.tsx into
  // SnapshotInstructionsSection.tsx (RULING 33's grouped extraction) - read
  // from there, not the panel, or this pin goes dark instead of red.
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotInstructionsSection.tsx");
  const strippedPanelSource = stripComments(fs.readFileSync(panelPath, "utf-8"));
  const barPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotCaptureBar.tsx");
  const strippedBarSource = stripComments(fs.readFileSync(barPath, "utf-8"));

  // The panel's own networking-disclosure <p>, anchored on its own opening
  // sentence and closed at its own </p> - never the whole file.
  const panelDisclosureStart = strippedPanelSource.indexOf(
    "Reading, grading, and the Alt+R rubric-capture chord each upload"
  );
  const panelDisclosureEnd = strippedPanelSource.indexOf("</p>", panelDisclosureStart);

  // SnapshotCaptureBar's own disclosure <p>, anchored on its own className.
  const barDisclosureStart = strippedBarSource.indexOf('<p className={bar.disclosure}>');
  const barDisclosureEnd = strippedBarSource.indexOf("</p>", barDisclosureStart);

  it("finds both disclosure paragraphs by their own anchors - a check over -1 proves nothing", () => {
    expect(panelDisclosureStart, "expected to find the panel's own disclosure paragraph").toBeGreaterThan(-1);
    expect(panelDisclosureEnd).toBeGreaterThan(panelDisclosureStart);
    expect(barDisclosureStart, "expected to find SnapshotCaptureBar's own disclosure paragraph").toBeGreaterThan(-1);
    expect(barDisclosureEnd).toBeGreaterThan(barDisclosureStart);
  });

  it("the panel's own disclosure paragraph mentions auto-grade triggering an upload automatically", () => {
    const disclosureText = strippedPanelSource.slice(panelDisclosureStart, panelDisclosureEnd);
    expect(disclosureText).toMatch(/auto-grade[\s\S]{0,200}armed[\s\S]{0,200}automatically/);
  });

  it("SnapshotCaptureBar's disclosure paragraph mentions auto-grade triggering an upload automatically", () => {
    const disclosureText = strippedBarSource.slice(barDisclosureStart, barDisclosureEnd);
    expect(disclosureText).toMatch(/auto-grade is armed[\s\S]{0,200}automatically/);
  });

  it("instruction 8's real amendment: the 'S to snap' clause states S can initiate an upload while auto-grade is armed", () => {
    expect(strippedBarSource).toMatch(/S to snap \(while auto-grade is armed, a snap can also start an automatic Grade\s+upload\)/);
  });
});

// ---------------------------------------------------------------------------
// SHOULD-FIX 6: nothing in src/**/*.test.ts pinned the panel's Checkbox
// before this - changing its onChange to a no-op would ship the feature's
// only surface control dead with every other test in this repo green.
// Mirrors moduleCard.selection.wiring.test.ts:94 and
// GenerateFromSelectionSection.checkpoints.test.ts:76's own technique: pin
// the tag, its checked binding, and its onChange binding, comment-stripped
// so a commented-out version cannot satisfy this.
// ---------------------------------------------------------------------------

describe("SHOULD-FIX 6: the auto-grade Checkbox is actually bound to autoGradeArmed/setAutoGradeArmed", () => {
  // A39 wave 3a-i moved this control out of SnapshotGradingPanel.tsx into
  // SnapshotInstructionsSection.tsx (RULING 33's grouped extraction); the
  // leaf receives the state and its setter renamed to onAutoGradeArmedChange,
  // so the onChange pin below is updated to match, not merely relocated.
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotInstructionsSection.tsx");
  const panelSource = stripComments(fs.readFileSync(panelPath, "utf-8"));

  it("renders a <Checkbox checked={autoGradeArmed} bound to the hook's own armed state", () => {
    expect(panelSource).toMatch(/<Checkbox\s+checked=\{autoGradeArmed\}/);
  });

  it("its onChange forwards the native checkbox's .target.checked to onAutoGradeArmedChange - not a no-op and not a hardcoded literal", () => {
    expect(panelSource).toMatch(/onChange=\{\(e\)\s*=>\s*onAutoGradeArmedChange\(e\.target\.checked\)\}/);
  });
});

// ---------------------------------------------------------------------------
// SHOULD-FIX 4: handleNextStudentConfirm must actually call the hook's
// boundary reset, not merely have it available - an import/destructure alone
// (matching this directory's own A4d/N14-wave-1 reachability-canary
// technique) proves nothing about whether it is actually invoked at the
// student boundary.
// ---------------------------------------------------------------------------

describe("SHOULD-FIX 4: handleNextStudentConfirm actually calls clearPendingAutoGrade (the auto-grade queue's boundary reset)", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = stripComments(fs.readFileSync(panelPath, "utf-8"));

  it("finds handleNextStudentConfirm's own body", () => {
    const start = panelSource.indexOf("const handleNextStudentConfirm = useCallback(() => {");
    const end = panelSource.indexOf("}, [clearPerStudentShots, announce, clearPendingAutoGrade]);", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("handleNextStudentConfirm's body calls clearPendingAutoGrade() - not merely destructuring it unused", () => {
    const start = panelSource.indexOf("const handleNextStudentConfirm = useCallback(() => {");
    const end = panelSource.indexOf("}, [clearPerStudentShots, announce, clearPendingAutoGrade]);", start);
    const body = panelSource.slice(start, end);
    expect(body).toMatch(/clearPendingAutoGrade\(\);/);
  });

  it("useSnapshotAutoGrade returns clearPendingAutoGrade, and its own body clears pendingAddedShotsRef.current to an empty array", () => {
    const hookPath = path.join(SNAPSHOT_GRADING_DIR, "useSnapshotAutoGrade.ts");
    const hookSource = stripComments(fs.readFileSync(hookPath, "utf-8"));
    const start = hookSource.indexOf("const clearPendingAutoGrade = useCallback(() => {");
    expect(start).toBeGreaterThan(-1);
    const end = hookSource.indexOf("}, []);", start);
    expect(end).toBeGreaterThan(start);
    const body = hookSource.slice(start, end);
    expect(body).toMatch(/pendingAddedShotsRef\.current\s*=\s*\[\]/);
  });
});

// BLOCKER C (round 2 remediation): the cross-student overwrite. Next student
// ends this pass WITHOUT waiting for or aborting a grade still in flight
// (aborting was rejected - it skips setGrading(false) via
// controller.signal.aborted, wedging `grading` true forever). Bumping
// studentGenerationRef instead - see useSnapshotGrade.wiring.test.ts's own
// BLOCKER C block for the hook half.
describe("BLOCKER C: handleNextStudentConfirm bumps studentGenerationRef, and the panel wires it into useSnapshotGrade", () => {
  const panelSource = stripComments(fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx"), "utf-8"));
  const confirmStart = panelSource.indexOf("const handleNextStudentConfirm = useCallback(() => {");
  const confirmEnd = panelSource.indexOf("}, [clearPerStudentShots, announce, clearPendingAutoGrade]);", confirmStart);
  const confirmBody = panelSource.slice(confirmStart, confirmEnd);

  it("declares studentGenerationRef = useRef(0), and handleNextStudentConfirm's body increments it - never merely declaring it unused", () => {
    expect(panelSource).toMatch(/const studentGenerationRef = useRef\(0\);/);
    expect(confirmStart).toBeGreaterThan(-1);
    expect(confirmEnd).toBeGreaterThan(confirmStart);
    expect(confirmBody).toMatch(/studentGenerationRef\.current\s*\+=\s*1;/);
  });

  it("handleNextStudentConfirm never calls gradeAbortRef - the naive fix (abort the in-flight call) was rejected because it wedges `grading` true forever", () => {
    expect(confirmBody).not.toMatch(/gradeAbortRef/);
  });

  it("the useSnapshotGrade( call site passes studentGenerationRef through", () => {
    const callStart = panelSource.indexOf("const { handleGrade } = useSnapshotGrade({");
    const callEnd = panelSource.indexOf("});", callStart);
    expect(callStart).toBeGreaterThan(-1);
    expect(callEnd).toBeGreaterThan(callStart);
    expect(panelSource.slice(callStart, callEnd)).toMatch(/studentGenerationRef,/);
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

// ---------------------------------------------------------------------------
// RES-N15-4 (docs/n15-rubric-picture-scope.md:913-920): this directory's
// image intake was drag-only, with no single-pointer alternative - WCAG 2.2
// SC 2.5.7 Level AA. The fix is a click-to-browse <input type="file"> that
// routes through the SAME handleFiles/handleZipFile the drop handler already
// calls (never a second intake path). Nothing renders under vitest here, so
// this only checks the fact and the wiring, never the exact label prose.
//
// A39 wave 3a-i: this control moved out of SnapshotGradingPanel.tsx into
// SnapshotCaptureSection.tsx (RULING 33's "fewer, larger" grouped
// extraction), so this scans the whole directory's combined non-test source
// rather than the panel file alone - the same idiom the exact-key-set check
// above already uses - so the anchor survives relocation within this
// directory instead of pinning to one file.
// ---------------------------------------------------------------------------

describe("RES-N15-4: SnapshotGradingPanel ships a click-to-browse file input wired to the SAME intake functions as drop", () => {
  const files = fs.readdirSync(SNAPSHOT_GRADING_DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const combinedSource = files.map((f) => fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, f), "utf-8")).join("\n");
  const stripped = stripComments(combinedSource);

  it('declares an <input type="file"> - the instrument RES-N15-4 measured as absent (exit 1)', () => {
    expect(stripped).toMatch(/<input[\s\S]{0,400}type="file"/);
  });

  it("that input's own onChange body calls handleFiles( and handleZipFile( - the same functions onDrop calls, not a second intake path", () => {
    const inputStart = stripped.indexOf("<input");
    const fileTypeIdx = stripped.indexOf('type="file"', inputStart);
    expect(inputStart, "expected to find an <input tag").toBeGreaterThan(-1);
    expect(fileTypeIdx, 'expected that <input to carry type="file"').toBeGreaterThan(inputStart);
    const onChangeStart = stripped.indexOf("onChange={", fileTypeIdx);
    const inputEnd = stripped.indexOf("/>", fileTypeIdx);
    expect(onChangeStart, "expected to find the file input's own onChange").toBeGreaterThan(-1);
    expect(inputEnd, "expected to find the file input's own self-close").toBeGreaterThan(fileTypeIdx);
    const onChangeBody = stripped.slice(onChangeStart, inputEnd);
    expect(onChangeBody).toMatch(/handleFiles\(/);
    expect(onChangeBody).toMatch(/handleZipFile\(/);
  });

  it("the browse control is a real, natively-focusable control (component=\"label\" with role={undefined}, the RubricInputModal.tsx recipe) - not a pointer-only div", () => {
    const labelIdx = stripped.indexOf('component="label"');
    expect(labelIdx, 'expected a component="label" Button (RubricInputModal.tsx precedent)').toBeGreaterThan(-1);
    const roleIdx = stripped.indexOf("role={undefined}", labelIdx);
    expect(roleIdx, "expected role={undefined} directly on that same Button").toBeGreaterThan(labelIdx);
    expect(roleIdx - labelIdx).toBeLessThan(120);
  });
});

// ---------------------------------------------------------------------------
// A24 (docs/a24-scope.md; DECISION 4, docs/owner-decisions-2026-09-23.md):
// the class-trends mount and its cohort-spread disclosure. Section 5's
// removal test, stated as a pass condition: object = the anchored slice of
// SnapshotGradingPanel.tsx bounded by the disclosure paragraph's own opening
// text and its closing </p>; instrument = fs.readFileSync plus paired
// String.indexOf anchors, both asserted to resolve before the slice is
// asserted on (the same idiom this file already runs at :263-264, :322-323,
// :352-353, :364-365); direction of failure = RED when the slice does not
// reference the spread predicate, and RED when either anchor fails to
// resolve.
//
// This is ALSO A24-2's reachability proof: buildSnapshotClassTrendsEntry and
// snapshotCohortSpread (classTrendsSnapshotEntry.ts) have no caller until
// this wave - a leaf shipped with no caller has passed every gate in this
// repo before (walkthrough-announcement.structure.test.ts's own G2 block
// exists for exactly that reason).
// ---------------------------------------------------------------------------

describe("A24: SnapshotGradingPanel actually mounts ClassTrendsPanel via the snapshot cohort entry - an import alone proves nothing", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");

  it("imports ClassTrendsPanel, hasTrendableResults, and the snapshot cohort leaf's two exports", () => {
    expect(panelSource).toMatch(/import ClassTrendsPanel from "\.\.\/drafted-grades\/ClassTrendsPanel";/);
    expect(panelSource).toMatch(
      /import\s*\{\s*buildSnapshotClassTrendsEntry,\s*snapshotCohortSpread\s*\}\s*from\s*"\.\/classTrendsSnapshotEntry";/
    );
  });

  it("actually renders <ClassTrendsPanel - the import alone proves nothing (A4d/N14 idiom)", () => {
    expect(panelSource).toMatch(/<ClassTrendsPanel\b/);
  });
});

describe("A24: the cohort-spread disclosure paragraph, anchored-slice, names no assignment", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");

  const start = panelSource.indexOf(
    "This table includes screenshot-graded assessments from more than one assignment"
  );
  const end = panelSource.indexOf("</p>", start);

  it("finds the disclosure paragraph by its own anchors - a check over -1 proves nothing", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("the disclosure paragraph is gated on snapshotCohortSpread(sessionRows) - deleting that gate must turn this assertion red, not merely change unobserved behaviour", () => {
    const gateStart = panelSource.indexOf("{snapshotCohortSpread(sessionRows) && (", 0);
    expect(gateStart).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(gateStart);
    expect(start - gateStart).toBeLessThan(400);
  });

  it("the disclosure sentence names no specific assignment (DECISION 4: the digest, never a label)", () => {
    const sentence = panelSource.slice(start, end);
    expect(sentence).not.toMatch(/\{.*assignmentName/);
  });
});
