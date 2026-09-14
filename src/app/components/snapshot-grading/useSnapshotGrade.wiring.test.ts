// R1 (Ruling R1-B item 2, the cross-file invariant). No test in this repo
// exercised useSnapshotGrade.ts's own wiring before this file - there is no
// useSnapshotGrade.test.ts. `handleGrade` is a `useCallback` return value
// (useSnapshotGrade.ts:83) - React throws "Invalid hook call... Hooks can
// only be called inside of the body of a function component" the moment
// `useCallback` runs outside React's render machinery, and this repo's
// vitest is node-env with no renderer (docs/loop/this-repo.md section 2:
// no component is ever rendered by any test here). Confirmed by running
// exactly that call during this wave: `TypeError: Cannot read properties of
// null (reading 'useCallback')` at useSnapshotGrade.ts:83. RULING R1-H is
// explicit that this file must not claim otherwise - the design document did,
// in a different section from where it also correctly said the opposite, and
// the ruling singles that contradiction out.
//
// So this file is SOURCE-TEXT ONLY - this repo's own *.wiring.test.ts
// convention (docs/loop/this-repo.md section 2: 64 such files, "the only
// mechanism that can check wiring" here) - reading useSnapshotGrade.ts as
// TEXT and pinning the FACTS that make the R1-B mapping correct, never the
// runtime behaviour those facts imply (that is what
// snapshot-shot.test.ts's buildIdByGlobalIndex oracle, snapshot-row.test.ts's
// resolveCitationShotPosition/buildShotReports oracles, and
// snapshot-citations.test.ts's shotId assertions cover, all of them real
// unit tests over plain functions this hook merely calls).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HOOK_PATH = join(process.cwd(), "src/app/components/snapshot-grading/useSnapshotGrade.ts");
const hookSource = readFileSync(HOOK_PATH, "utf8");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const stripped = stripComments(hookSource);

describe("R1-B: idByGlobalIndex is built from `shots`, never from a ref", () => {
  it("calls buildIdByGlobalIndex(shots) - the destructured params field, not shotsRef.current", () => {
    expect(stripped).toMatch(/buildIdByGlobalIndex\(\s*shots\s*\)/);
  });

  it("never reads shotsRef.current anywhere in this file - RULING R1-G: the controlled form of the grep the ruling kept, after deleting the uncontrolled standalone form (which returns 0 today and would pass whether or not the map is correct)", () => {
    expect(stripped).not.toMatch(/shotsRef\.current/);
  });

  it("idByGlobalIndex is built in the same synchronous stretch as shotsForGrade, before the `await` that is this function's only yield point - the closure-safety argument (carried forward from the checker) that lets `shots` be read safely without a ref at all", () => {
    const shotsForGradeIdx = stripped.indexOf("const shotsForGrade =");
    const idByGlobalIndexIdx = stripped.indexOf("const idByGlobalIndex = buildIdByGlobalIndex(shots);");
    const awaitIdx = stripped.indexOf("const result = await snapshotGradeAction(");
    expect(shotsForGradeIdx).toBeGreaterThan(-1);
    expect(idByGlobalIndexIdx).toBeGreaterThan(shotsForGradeIdx);
    expect(awaitIdx).toBeGreaterThan(idByGlobalIndexIdx);
  });
});

describe("R1-B: verifySnapshotCitations receives idByGlobalIndex as its fifth argument", () => {
  it("passes idByGlobalIndex as the last argument to verifySnapshotCitations", () => {
    const callStart = stripped.indexOf("verifySnapshotCitations(");
    expect(callStart).toBeGreaterThan(-1);
    const callEnd = stripped.indexOf(");", callStart);
    const call = stripped.slice(callStart, callEnd);
    expect(call).toMatch(/idByGlobalIndex\s*$/);
  });
});

describe("R1-B: buildShotReports replaces the inline shotReports construction", () => {
  it("calls buildShotReports(shots, shotReads) rather than re-deriving the report array inline", () => {
    expect(stripped).toMatch(/const shotReports = buildShotReports\(\s*shots\s*,\s*shotReads\s*\)/);
  });
});

describe("R1-E: the transcript lookup is matched by shot.id, not by read-time position alone", () => {
  it("builds an id-keyed transcript map from shotReads before deriving the index-keyed one verifySnapshotCitations reads", () => {
    const idMapIdx = stripped.indexOf("const transcriptsByShotId = new Map<string, string>();");
    const indexMapIdx = stripped.indexOf("const transcriptsByShotIndex = new Map<number, string>();");
    expect(idMapIdx).toBeGreaterThan(-1);
    expect(indexMapIdx).toBeGreaterThan(idMapIdx);
  });

  it("the index-keyed map is populated by walking the CURRENT `shots` array and looking each one up by its own id - not by re-keying shotReads' own (read-time) numeric keys directly", () => {
    const indexMapIdx = stripped.indexOf("const transcriptsByShotIndex = new Map<number, string>();");
    const afterIdx = stripped.slice(indexMapIdx, indexMapIdx + 300);
    expect(afterIdx).toMatch(/shots\.forEach\(\s*\(\s*shot\s*,\s*i\s*\)/);
    expect(afterIdx).toMatch(/transcriptsByShotId\.get\(\s*shot\.id\s*\)/);
  });
});
