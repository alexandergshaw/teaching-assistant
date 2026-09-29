import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { walkFiles, stripComments, toRepoRelativePosix } from "@/app/components/ui/modalAdoptionSourceScan";

// RES-FILL-6 / RULING 57 (docs/res-fill-6-provenance-guard-notes.md, checked
// BUILDABLE by docs/res-fill-6-provenance-guard-notes-check.md, 0 blockers):
// Instrument A of the two-instrument guard. RULING 57
// (rubric-provenance-stamp.ts:1-27) requires every producer of a rendered
// GradingRun to carry the rubricUsed/rubricFingerprint pair, stamped
// SOMEWHERE on its path (not necessarily in its own body - a producer that
// passes through an already-stamped pair, or delegates to another producer
// that stamps, satisfies the rule just as well as one that calls
// stampRubricProvenance directly).
//
// This file catches ONE direction only: "a new producer was added without
// being classified and routed to a behavioural check." It does this by
// LIVE-DERIVING the producer set from source every run (never a static file
// list - that is the exact anti-pattern this row exists to kill) and
// set-comparing it, both directions, against a frozen, hand-classified
// EXPECTED_PRODUCERS. This is the same shape as this repo's endorsed
// headless-count canary (HEADLESS_SAFE_STEP_TYPES.size): the SET is derived
// live; only the EXPECTED list is frozen, and a new producer changes the
// live derivation and breaks the comparison - it cannot be added silently.
//
// This instrument does NOT verify that a producer actually stamps correctly -
// a producer that never calls stampRubricProvenance in its own body (e.g. a
// pass-through that carries an upstream pair) is CORRECT, not a defect, and a
// body-presence check would false-positive on exactly those producers (see
// the design notes section 4). That verification is Instrument B's job
// (rubric-stamp.wiring.test.ts's behavioural drivers), which checks the
// OUTPUT of each producer's real production path instead of its source text.
//
// KNOWN, DISCLOSED GAP (design section 9 / residual R1 - not closed here):
// the return-type regex below only matches a `function`-declaration producer
// returning bare `GradingRun` or `Promise<GradingRun>`. It MISSES an
// arrow-function producer (`const f = (): GradingRun => ...`) and a producer
// returning a union (`GradingRun | null` / `Promise<GradingRun | null>`).
// Neither shape exists in the tree today (verified: every one of the nine
// matches below is a `function` declaration returning the bare type), so the
// guard is COMPLETE FOR THE CURRENT TREE, not for all future producers.
// Broadening the regex is deliberately deferred (R1) rather than folded in
// silently, because a looser match risks false-positiving on an arrow
// function that merely returns an object literal for an unrelated reason.

const SRC_ROOT = join(process.cwd(), "src");

/** The exact pattern the row's own grep uses (docs/res-fill-6-provenance-
 *  guard-notes.md section 2.1), applied as a JS RegExp over comment-stripped
 *  source instead of a line-wise grep, so a commented-out match cannot leak
 *  in and a multi-line signature is still found. */
const PRODUCER_RETURN_TYPE_PATTERN = /\)\s*:\s*(?:Promise<)?GradingRun>?\s*\{/g;
const FUNCTION_NAME_PATTERN = /function\s+([A-Za-z0-9_$]+)/g;

interface ProducerExpectation {
  readonly id: string;
  /** "fresh" = stamps in its own body against a text it computed itself.
   *  "pass-through" = returns an already-stamped pair from one hop upstream,
   *  no own stamp call. "mixed" = an early-return branch stamps directly;
   *  the main branch delegates to another producer that stamps.
   *  "transform-excluded" = RULING-57-excluded: transforms an
   *  already-produced run rather than producing one, and must preserve
   *  (never touch) whatever pair the incoming run already carries. */
  readonly disposition: "fresh" | "pass-through" | "mixed" | "transform-excluded";
  /** Which behavioural driver (Instrument B) is responsible for verifying
   *  this producer's actual stamping - "known but not stamp-verified here" is
   *  not a legal value; every entry must name one. */
  readonly coveredBy: string;
}

/** Frozen, classified expectation - derived from the row's own grep, re-run
 *  and reconciled at build time (docs/res-fill-6-provenance-guard-notes.md
 *  section 2.1/6). NOT a static producer list standing in for the scan: the
 *  scan below re-derives the SET live every run; this array only supplies the
 *  canary's expected value and the human-maintained metadata (disposition,
 *  coveredBy) that a bare set comparison cannot carry. Bump this array, in
 *  the same commit, whenever a producer is added, removed, or renamed - the
 *  same discipline as HEADLESS_SAFE_STEP_TYPES.size. */
const EXPECTED_PRODUCERS: readonly ProducerExpectation[] = [
  {
    id: "src/app/actions/grading-run-mapping.ts::gradingApiToRun",
    disposition: "fresh",
    coveredBy: "behavioural: gradingApiToRun driver (rubric-stamp.wiring.test.ts)",
  },
  {
    id: "src/app/components/grading/incrementalRunPlan.ts::buildIncrementalRun",
    disposition: "pass-through",
    coveredBy: "behavioural: buildIncrementalRun header pass-through driver (rubric-stamp.wiring.test.ts)",
  },
  {
    id: "src/lib/embedded-grader/discussion.ts::gradeDiscussion",
    disposition: "fresh",
    coveredBy: "behavioural: gradeDiscussion driver (rubric-stamp.wiring.test.ts)",
  },
  {
    id: "src/lib/embedded-grader/index.ts::gradeEntriesEmbedded",
    disposition: "fresh",
    coveredBy: "behavioural: gradeEntriesEmbedded driver (rubric-stamp.wiring.test.ts)",
  },
  {
    id: "src/lib/grade/engine.ts::gradeStudentEntries",
    disposition: "fresh",
    coveredBy: "behavioural: gradeStudentEntries driver, driven via the exported gradeEntries (rubric-stamp.wiring.test.ts) - gradeStudentEntries itself is not exported",
  },
  {
    id: "src/lib/grade/engine.ts::gradeSubmissions",
    disposition: "mixed",
    coveredBy: "behavioural: gradeSubmissions empty-students-branch driver + delegation to gradeStudentEntries (rubric-stamp.wiring.test.ts)",
  },
  {
    id: "src/lib/grade/engine.ts::gradeEntries",
    disposition: "pass-through",
    coveredBy: "behavioural: rubric-stamp.wiring.test.ts (existing driver)",
  },
  {
    id: "src/lib/grade/engine.ts::gradeCanvasUrl",
    disposition: "mixed",
    coveredBy: "behavioural: gradeCanvasUrl empty-students-branch driver + delegation to gradeStudentEntries (rubric-stamp.wiring.test.ts)",
  },
  {
    id: "src/lib/workflows/grading-review-rows.ts::stripGradingRunForDraft",
    disposition: "transform-excluded",
    coveredBy: "behavioural: stripGradingRunForDraft pair-survives-the-transform driver (rubric-stamp.wiring.test.ts)",
  },
];

/** Live-derives the `<repo-relative-posix-path>::<function-name>` id for
 *  every GradingRun producer under src/**\/*.ts (excluding *.test.ts), by
 *  walking the tree fresh every run - never a cached or hand-maintained file
 *  list. Each id's function name is resolved by finding the LAST
 *  `function <name>` token before the matched return-type-and-brace, which
 *  is always that match's own enclosing signature (verified: no producer in
 *  this tree nests inside another function that itself matches). */
function deriveProducerIds(): string[] {
  const files = walkFiles(SRC_ROOT, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
  const ids: string[] = [];
  for (const absPath of files) {
    const stripped = stripComments(readFileSync(absPath, "utf8"));
    const matches = [...stripped.matchAll(PRODUCER_RETURN_TYPE_PATTERN)];
    if (matches.length === 0) continue;
    const relPath = toRepoRelativePosix(absPath);
    for (const match of matches) {
      const before = stripped.slice(0, match.index);
      let name: string | undefined;
      let nameMatch: RegExpExecArray | null;
      FUNCTION_NAME_PATTERN.lastIndex = 0;
      while ((nameMatch = FUNCTION_NAME_PATTERN.exec(before))) {
        name = nameMatch[1];
      }
      if (name) ids.push(`${relPath}::${name}`);
    }
  }
  return ids;
}

describe("RULING 57 GradingRun-producer canary (Instrument A - source scan)", () => {
  it("the live-derived producer set matches the frozen, classified EXPECTED_PRODUCERS, both directions", () => {
    const derived = [...new Set(deriveProducerIds())].sort();
    const expected = EXPECTED_PRODUCERS.map((p) => p.id).sort();

    // A NEW producer (derived but not expected) forces this red until it is
    // classified and added above with a behavioural driver named in
    // coveredBy. A REMOVED/RENAMED producer (expected but not derived) forces
    // this red too, so a stale entry cannot linger unnoticed.
    const newProducers = derived.filter((id) => !expected.includes(id));
    const missingProducers = expected.filter((id) => !derived.includes(id));

    expect(newProducers).toEqual([]);
    expect(missingProducers).toEqual([]);
  });

  it("every expected producer carries a disposition and a named behavioural coverer (metadata completeness, not part of the set-equality)", () => {
    for (const producer of EXPECTED_PRODUCERS) {
      expect(producer.disposition.length).toBeGreaterThan(0);
      expect(producer.coveredBy.length).toBeGreaterThan(0);
    }
  });
});
