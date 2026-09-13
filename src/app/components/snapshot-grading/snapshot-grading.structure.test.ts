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
// gate in this repo. Exact-set (not merely ordinal) since this wave's own
// key set is small and fully known: only the armed-role toggle persists
// (U10: rubric/assignment text does not exist in this wave, and even once it
// lands in a later wave U10 says it must NOT persist).
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

  it("calls both actions somewhere in the file - a check that neither is called anywhere proves nothing", () => {
    expect(panelSource).toMatch(/snapshotReadBatchAction\(/);
    expect(panelSource).toMatch(/snapshotGradeAction\(/);
  });

  it("no useEffect block in the panel calls snapshotReadBatchAction or snapshotGradeAction", () => {
    const effectBodies = extractEffectBodies(panelSource);
    for (const body of effectBodies) {
      expect(body).not.toMatch(/snapshotReadBatchAction\(/);
      expect(body).not.toMatch(/snapshotGradeAction\(/);
    }
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

  it("finds exactly the expected ta-snap-* key set (the armed-role toggle and the completed-assessment table; U10 keeps shot bytes and rubric/assignment text out of localStorage)", () => {
    expect(distinctKeys).toEqual(["ta-snap-armed-role", "ta-snap-table"]);
  });

  it("ta-snap-armed-role is wired to both a read and a write", () => {
    expect(combinedSource).toMatch(/localStorage\.getItem\(\s*ARMED_ROLE_KEY\s*\)/);
    expect(combinedSource).toMatch(/localStorage\.setItem\(\s*ARMED_ROLE_KEY\s*,/);
  });
});
