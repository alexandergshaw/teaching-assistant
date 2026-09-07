import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { DEFAULT_CONCERN_THRESHOLDS } from "./concern";
import { lmsCourseNotLinked } from "./connection";
import { DEFAULT_ENGAGEMENT_THRESHOLDS } from "./engagement";
import { OFFLINE_SCOPE_USER_ID_SENTINEL, prepareOfflineAsk, type PrepareOfflineAskResult } from "./offline-ask";
import { parseOfflinePayload } from "./offline-payload";
import type { LlmContent } from "@/lib/llm";

// THE LAST LINK, tested end to end: recorded rows in, turns for the model
// out. Before this module existed `assembleOfflineCourseIntel` and everything
// under it had ZERO non-test importers - they computed correctly over
// nothing - so the reachability block at the bottom of this file traces the
// chain from the route to the assembly by source text, because a green unit
// suite proves nothing about whether anything calls it.
//
// TWO NAMES THAT CANNOT OCCUR BY ACCIDENT are used throughout. A leak test
// built on a plausible name ("Alex") passes for the wrong reason the moment
// the word appears in a template sentence.

const COURSE = "course-1";
const NOW = "2026-04-01T12:00:00.000Z";
const NONCE = "nonce-abc123";

const ZORVATH = "Zorvath Quilliman";
const BEXLEY = "Bexley Trundlemoor";

function payload(over: Record<string, unknown> = {}) {
  return parseOfflinePayload({
    gradingRows: [
      { course: COURSE, studentName: ZORVATH, assessment: "Essay 2", totalScore: "4/20" },
      { course: COURSE, studentName: ZORVATH, assessment: "Essay 3", totalScore: "5/20" },
    ],
    replyRows: [],
    assessmentDeclarations: [],
    toolDeclarations: [],
    ...over,
  });
}

function prepare(question: string, over: Record<string, unknown> = {}): PrepareOfflineAskResult {
  return prepareOfflineAsk({
    courseHubId: COURSE,
    courseName: "Ethical Hacking",
    rosterNames: [ZORVATH, BEXLEY],
    studentRepos: [],
    payload: payload(),
    question,
    concernThresholds: DEFAULT_CONCERN_THRESHOLDS,
    engagementThresholds: DEFAULT_ENGAGEMENT_THRESHOLDS,
    connection: lmsCourseNotLinked("Add a Canvas course URL on the course tile."),
    now: NOW,
    nonce: NONCE,
    ...over,
  });
}

function turnText(turns: readonly LlmContent[]): string {
  return turns.map((turn) => turn.parts.map((part) => ("text" in part ? part.text : "")).join("\n")).join("\n\n");
}

function prepared(result: PrepareOfflineAskResult) {
  if (result.status !== "prepared") throw new Error(`expected prepared, got ${result.status}`);
  return result;
}

describe("prepareOfflineAsk - an offline assembly is built from recorded rows and reaches the model", () => {
  it("computes rows from the recorded grading table and renders them into the turns", () => {
    const result = prepared(prepare("Who are the students of concern?"));

    // The assembly actually saw the rows: both roster students are in it, and
    // the recorded assessments are the denominator.
    expect(result.intel.identity.students.map((s) => s.index)).toEqual([1, 2]);
    expect([...result.intel.concerns.recordedAssessmentIds]).toEqual(["Essay 2", "Essay 3"]);
    expect(result.intel.concerns.rows.length).toBeGreaterThan(0);

    const text = turnText(result.turns);
    expect(text).toContain("Essay 2");
    // Every computed label reaches the model verbatim - the model is handed
    // the sentences this code wrote, never asked to invent them.
    for (const row of result.intel.concerns.rows) {
      for (const signal of row.signals) expect(text).toContain(signal.label);
    }
  });

  it("the model is handed EXACTLY the computed rows - membership is decided in TypeScript (D1/D21f)", () => {
    const result = prepared(prepare("Who are the students of concern?"));
    const text = turnText(result.turns);

    const section = text.split("RECORDED-WORK ROWS (these are given to you; they are not yours to choose)")[1] ?? "";
    const listed = section.trimStart().split("\n\n")[0] ?? "";
    const renderedIndexes = [...listed.matchAll(/^- S(\d+):/gm)].map((m) => Number(m[1])).sort((a, b) => a - b);
    const computedIndexes = result.intel.concerns.rows.map((row) => row.studentIndex).sort((a, b) => a - b);

    // Non-vacuous by construction: an empty rendered list cannot satisfy a
    // comparison against a non-empty computed list.
    expect(computedIndexes.length).toBeGreaterThan(0);
    expect(renderedIndexes).toEqual(computedIndexes);
    expect(text).toContain("they are not yours to choose");
  });

  it("a student with no recorded work is insufficient-data, never missing everything", () => {
    const result = prepared(prepare("Who are the students of concern?"));

    const bexley = result.intel.concerns.rows.find((row) => row.studentIndex === 2);
    expect(bexley, "the student with no recorded work must still be REPORTED").toBeDefined();
    expect(bexley!.rollup.kind).toBe("never-recorded");
    expect(bexley!.signals.map((s) => s.kind)).toContain("insufficient-data");

    const text = turnText(result.turns);
    const bexleyLine = text.split("\n").find((line) => line.startsWith("S2 |")) ?? "";
    expect(bexleyLine).toContain("nothing recorded for this student");
    // The sentence the whole design exists to prevent. Written as a pattern
    // rather than one literal so a differently-worded version of the same
    // claim is caught too.
    expect(bexleyLine).not.toMatch(/\d+ of \d+ recorded assessments have no recorded work/);
  });
});

describe("prepareOfflineAsk - no student name reaches any composed prompt", () => {
  it("a question naming a student is rewritten to that student's marker", () => {
    const result = prepared(prepare(`How is ${ZORVATH} doing?`));
    expect(result.subjectIndex).toBe(1);

    const text = turnText(result.turns);
    expect(text).toContain("S1");
    // POSITIVE CONTROL: the same search over the raw question DOES find the
    // name, so a clean result above means the rewrite happened rather than
    // that this search cannot find anything.
    expect(`How is ${ZORVATH} doing?`.toLowerCase()).toContain("zorvath");
    expect(text.toLowerCase()).not.toContain("zorvath");
    expect(text.toLowerCase()).not.toContain("quilliman");
  });

  it("no roster name appears anywhere in the whole-class prompt either", () => {
    const result = prepared(prepare("Who are the students of concern?"));
    const text = turnText(result.turns).toLowerCase();
    for (const token of ["zorvath", "quilliman", "bexley", "trundlemoor"]) {
      expect(text, `"${token}" must not reach the model`).not.toContain(token);
    }
    // And the students WERE in this assembly, so the check above ran over a
    // prompt that had something to leak.
    expect(result.students.map((s) => s.name)).toEqual([ZORVATH, BEXLEY]);
    expect(turnText(result.turns)).toContain("S1");
    expect(turnText(result.turns)).toContain("S2");
  });

  it("a captured name that is not on the roster still never reaches the prompt", () => {
    const result = prepared(
      prepare("Who are the students of concern?", {
        payload: payload({
          gradingRows: [
            { course: COURSE, studentName: "Wexford Plimsole", assessment: "Essay 2", totalScore: "3/20" },
            { course: COURSE, studentName: ZORVATH, assessment: "Essay 2", totalScore: "4/20" },
          ],
        }),
      })
    );
    const text = turnText(result.turns).toLowerCase();
    expect(text).not.toContain("wexford");
    expect(text).not.toContain("plimsole");
    // It was counted rather than dropped in silence.
    expect(result.coverageNotes.join(" ")).toContain("not on this course's roster");
  });

  it("the offline join key, which embeds the canonicalised name, never reaches the prompt", () => {
    const result = prepared(prepare("Who are the students of concern?"));
    const keys = result.intel.identity.students.map((s) => s.key).filter((key): key is string => key !== null);
    expect(keys.length).toBeGreaterThan(0);
    const text = turnText(result.turns);
    for (const key of keys) expect(text).not.toContain(key);
  });
});

describe("prepareOfflineAsk - refusals, and the id sentinel that never escapes", () => {
  it("a name matching two roster entries is refused, never picked", () => {
    const result = prepare(`How is ${ZORVATH} doing?`, { rosterNames: [ZORVATH, ZORVATH, BEXLEY] });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.matchedText.toLowerCase()).toContain("zorvath");
  });

  it("a question naming two students is refused rather than narrowed", () => {
    const result = prepare(`Compare ${ZORVATH} and ${BEXLEY}`);
    expect(result.status).toBe("multiple-students");
    if (result.status !== "multiple-students") return;
    expect([...result.subjects].sort()).toEqual([1, 2]);
  });

  it("the scope sentinel appears in nothing this module returns", () => {
    // The adapter passes 0 for ScopeRosterEntry.userId because offline
    // students have no Canvas id. It must not travel: every id in a result
    // comes from the identity index, which carries null rather than a
    // placeholder.
    for (const question of ["Who are the students of concern?", `How is ${ZORVATH} doing?`]) {
      const result = prepare(question);
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(`"userId":${OFFLINE_SCOPE_USER_ID_SENTINEL}`);
      if (result.status !== "prepared") continue;
      for (const student of result.students) expect(student.userId).not.toBe(OFFLINE_SCOPE_USER_ID_SENTINEL);
      for (const marked of result.markedStudents) expect(marked.userId).not.toBe(OFFLINE_SCOPE_USER_ID_SENTINEL);
    }
  });

  it("a real cached Canvas id survives, and a name-only student stays null", () => {
    const result = prepared(
      prepare("Who are the students of concern?", {
        studentRepos: [{ student: ZORVATH, canvasUserId: "4021" }],
      })
    );
    const byIndex = new Map(result.students.map((s) => [s.index, s]));
    expect(byIndex.get(1)?.userId).toBe(4021);
    expect(byIndex.get(2)?.userId).toBeNull();
  });
});

describe("prepareOfflineAsk - a question about writing is answered as one it cannot answer", () => {
  it("says outright that no student writing was given", () => {
    const result = prepared(prepare(`What areas has ${ZORVATH} asked about?`));
    const text = turnText(result.turns);
    expect(text).toContain("you were given NONE of their writing");
    expect(text.toLowerCase()).not.toContain("zorvath");
  });

  it("only that shape suppresses the code-authored signal strip (D7/D15)", () => {
    // The strip exists because every named student must trace to a concrete
    // signal. The topics shape is the one question with no per-student signal
    // check behind it, so it is the one question the strip does not describe.
    expect(prepared(prepare(`What areas has ${ZORVATH} asked about?`)).asksAboutWriting).toBe(true);
    expect(prepared(prepare(`How is ${ZORVATH} doing?`)).asksAboutWriting).toBe(false);
    expect(prepared(prepare("Who are the students of concern?")).asksAboutWriting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REACHABILITY. Every module below this line was built, tested and
// sabotage-checked with zero non-test importers. A unit suite cannot tell the
// difference between "correct" and "correct and unreachable", so the chain is
// traced through source text - the same discipline this repo's other
// reachability canaries use.
// ---------------------------------------------------------------------------

describe("the offline chain is actually reachable from the ask route", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");

  it("the route imports prepareOfflineAsk and calls it", () => {
    const route = read("src/app/api/course-intel/ask/route.ts");
    expect(route).toContain('from "@/lib/course-intel/offline-ask"');
    expect(route).toMatch(/prepareOfflineAsk\(\{/);
  });

  it("this module imports assembleOfflineCourseIntel and calls it", () => {
    const source = read("src/lib/course-intel/offline-ask.ts");
    expect(source).toContain('from "./offline-assembly"');
    expect(source).toMatch(/assembleOfflineCourseIntel\(\{/);
  });

  it("the browser posts the recorded tables the offline path needs", () => {
    const hook = read("src/app/components/course-intel/useCourseIntel.ts");
    expect(hook).toMatch(/offline: readOfflineRecordedTables\(/);
    expect(hook).toContain('fetch("/api/course-intel/ask"');
  });

  it("a course with no Canvas link degrades instead of being refused", () => {
    const route = read("src/app/api/course-intel/ask/route.ts");
    // The branch that used to answer 400 must now hand off to the offline
    // path. Both halves are checked: the offline call is present, and the
    // refusal it replaced is gone.
    expect(route).toMatch(/if \(!institutionCode \|\| !canvasCourseId\) \{[\s\S]{0,400}?answerOffline\(\s*\n?\s*lmsCourseNotLinked\(/);
    expect(route).not.toContain("This course needs a Canvas course link and an institution before it can be read.");
  });

  it("a failed live read degrades and is CLASSIFIED, not reported as one state", () => {
    const route = read("src/app/api/course-intel/ask/route.ts");
    // THE WHOLE CATCH BLOCK IS EXTRACTED AND CHECKED, not searched. A
    // "contains classifyLmsFailure" test passes with an early `return
    // NextResponse.json(..., 502)` sitting above it, which is precisely the
    // regression this asserts against - so the block must contain the
    // classifier AND no response of its own.
    const anchor = route.indexOf('"Reading this course from Canvas"');
    expect(anchor, "the signals fetch anchor moved - re-point this check").toBeGreaterThan(-1);
    const catchStart = route.indexOf("catch (err) {", anchor);
    expect(catchStart).toBeGreaterThan(anchor);
    const catchEnd = route.indexOf("\n  }\n", catchStart);
    expect(catchEnd).toBeGreaterThan(catchStart);
    const block = route.slice(catchStart, catchEnd);

    expect(block).toContain("answerOffline(");
    expect(block).toContain("classifyLmsFailure({");
    expect(block, "the live-failure catch must degrade, never answer with an error").not.toContain("NextResponse.json");
  });

  it("the credential message is compared by IDENTITY, never by a copied literal", () => {
    // course-picker-availability.test.ts's own rule for this same constant: a
    // literal here keeps passing after the real message changes, while every
    // unconfigured institution starts reporting as `unreachable`.
    const route = read("src/app/api/course-intel/ask/route.ts");
    expect(route).toContain("CANVAS_CREDENTIAL_REQUIRED_MESSAGE");
    expect(route).not.toContain("Connect your Canvas account for this institution in Settings.");
  });

  it("the request body field the hook sends is the one the route reads", () => {
    // The exact defect this pair caught once already: the hook posted
    // `courseHubId` and the route read `courseId`, so every ask answered
    // "Pick a course first" with every gate green.
    const hook = read("src/app/components/course-intel/useCourseIntel.ts");
    const route = read("src/app/api/course-intel/ask/route.ts");
    expect(hook).toMatch(/courseId: courseHubId/);
    expect(route).toMatch(/asString\(body\.courseId\)/);
    expect(hook).not.toMatch(/courseHubId: courseHubId/);
  });
});
