// AC2: the rubric is generated blind to the course kind.
//
// steps.rubrics.ts contains no reference to `courseKind` at all, so an
// APPLIED (no-code) course gets a rubric built by the CODING generator. A
// real generated ethical-hacking course - whose assignments are entirely
// code-free - shipped criteria grading "correct industry-standard tools,
// configurations, and syntax", "code blocks", "code snippets", "properly
// commented code", and "well-commented code". This is the same defect class
// as the toolset bug: a generator that does not know what kind of course it
// is serving.
//
// Every other kind-aware step in this registry reads the kind the same way -
// `resolveCourseKind(values.courseKind)` (steps.assignments-template.ts,
// steps.content-lectures.ts, steps.course-guides.ts, and seven more) - so
// these tests drive the step through that same established input, not through
// an invented one.
//
// WHAT THIS FILE PINS, AND WHAT IT DOES NOT:
// - "generate-rubric-offline" is FULLY DETERMINISTIC (no model call at all -
//   generateEmbeddedRubricText). Its assertions are on the REAL generated
//   rubric text and prove actual behavior.
// - "lms-rubric" reaches a model through a server action, so its assertion is
//   only that the resolved course kind REACHES the generator. It cannot prove
//   what a model then writes; the prompt-level half of that is pinned in
//   src/lib/grade/rubric.course-kind.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";

vi.mock("@/app/actions", () => ({
  getRepoZipAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  setCourseRubricAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  createRubricAction: vi.fn(),
  generateCourseRubricFromZipAction: vi.fn(),
  generateCourseRubricFromScheduleAction: vi.fn(),
  rememberRubricAction: vi.fn(),
  findBankedRubricAction: vi.fn(),
  bulkAssociateRubricAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  fetchCanvasMetaAction: vi.fn(),
}));

import { generateCourseRubricFromScheduleAction, setCourseRubricAction, createRubricAction } from "@/app/actions";
import { rubricSteps } from "./steps.rubrics";

const offlineStep = rubricSteps.find((s) => s.type === "generate-rubric-offline")!;
const lmsRubricStep = rubricSteps.find((s) => s.type === "lms-rubric")!;

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    ...overrides,
  };
}

const noop = () => {};

// A realistic APPLIED (no-code) assignment: an ethical-hacking rules-of-
// engagement memo, the exact kind of course the defect was measured on.
// Nothing in it asks a student to read, write, or run anything.
const APPLIED_ASSIGNMENT = `# Rules of Engagement Memo

## Assignment Overview
Draft the rules of engagement for an authorized security assessment.

## Instructions
- Explain the method you used to prioritize each finding.
- Name the escalation contact for a critical finding.

## Requirements
- The scope statement must name every in-scope system and explicitly exclude everything else.
- The escalation path must name a single accountable owner reachable outside business hours.
- Every authorization claim must be traceable to a signed approval.

## Deliverables
- Submit the memo as a .docx file of at least 500 words.
- Apply the memo to your own selected target organization, not a textbook example.`;

// A genuinely CODING assignment, so the guard test below cannot be satisfied
// by simply deleting code awareness everywhere.
const CODING_ASSIGNMENT = `# Sorting Lab

## Requirements
- Define a function named merge_sort that sorts a list of integers.

## Deliverables
- Submit sorting.py.`;

// The code-oriented vocabulary an applied course's rubric must never carry.
// Each entry is drawn from what the real generated course actually shipped
// (or, for the last two, from the offline generator's own criterion shapes).
const CODE_ORIENTED: Array<[string, RegExp]> = [
  ["the bare word 'code'", /\bcode\b/i],
  ["'syntax'", /\bsyntax\b/i],
  ["'code snippet' / 'code block'", /\b(?:code\s+)?(?:snippet|block)s?\b/i],
  ["'well-commented' / 'properly commented'", /\b(?:well|properly)[\s-]commented\b/i],
  ["a 'Defines <symbol>' criterion", /^Defines\s/m],
];

describe("generate-rubric-offline: course-kind awareness (AC2, deterministic)", () => {
  it("an APPLIED course's rubric carries no code-oriented criteria", async () => {
    const result = await offlineStep.run(
      { instructions: APPLIED_ASSIGNMENT, courseKind: "applied" },
      testHelpers(),
      noop
    );
    const rubric = String(result.outputs.rubric ?? "");

    expect(rubric.trim().length).toBeGreaterThan(0);
    for (const [label, pattern] of CODE_ORIENTED) {
      expect(rubric, `an applied course's rubric still uses ${label}`).not.toMatch(pattern);
    }
  });

  it("an APPLIED course's rubric still grades the assignment's own stated requirements", async () => {
    // The complement of the test above: proving the criteria are gone is only
    // half of it - the rubric must still be a real rubric, graded against
    // what this assignment actually asks for.
    const result = await offlineStep.run(
      { instructions: APPLIED_ASSIGNMENT, courseKind: "applied" },
      testHelpers(),
      noop
    );
    const rubric = String(result.outputs.rubric ?? "");

    expect(rubric).toContain("The scope statement must name every in-scope system");
    expect(rubric).toContain("The escalation path must name a single accountable owner");
  });

  // OVER-REACH GUARD (passes today by design): the fix must not be a blanket
  // removal of code awareness. A coding course keeps its code-aware criteria.
  it("a CODING course still gets code-aware criteria", async () => {
    const result = await offlineStep.run(
      { instructions: CODING_ASSIGNMENT, courseKind: "coding" },
      testHelpers(),
      noop
    );
    const rubric = String(result.outputs.rubric ?? "");

    expect(rubric).toMatch(/^Defines merge_sort/m);
    expect(rubric).toMatch(/\bcode\b/i);
  });

  // OVER-REACH GUARD (passes today by design): an omitted courseKind must keep
  // behaving exactly as it does today - "coding" is the repo-wide default
  // (resolveCourseKind), and every stored workflow that predates this fix
  // supplies no courseKind at all.
  it("an omitted courseKind behaves exactly like an explicit coding course", async () => {
    const withDefault = await offlineStep.run({ instructions: CODING_ASSIGNMENT }, testHelpers(), noop);
    const withExplicit = await offlineStep.run(
      { instructions: CODING_ASSIGNMENT, courseKind: "coding" },
      testHelpers(),
      noop
    );

    expect(String(withDefault.outputs.rubric ?? "")).toBe(String(withExplicit.outputs.rubric ?? ""));
  });
});

// A rubric in the shape parseGeneratedRubric expects, so the step gets past
// parsing and on to its save steps.
const PARSEABLE_RUBRIC = [
  "Scope Statement (50%): The memo names every in-scope system.",
  "  Excellent (100% - no deductions): Every in-scope system is named.",
  "  Meets Expectations (75% - 25% deducted): Some systems are missing.",
  "  Needs Improvement (50% - 50% deducted): The scope is not stated.",
  "Escalation Path (50%): The memo names one accountable owner.",
  "  Excellent (100% - no deductions): One owner is named and reachable.",
  "  Meets Expectations (75% - 25% deducted): An owner is named but not reachable.",
  "  Needs Improvement (50% - 50% deducted): No owner is named.",
].join("\n");

describe("lms-rubric: course-kind awareness (AC2, wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateCourseRubricFromScheduleAction).mockResolvedValue(PARSEABLE_RUBRIC);
    vi.mocked(setCourseRubricAction).mockResolvedValue({ ok: true } as never);
  });

  // This asserts only that the course kind REACHES the generator - it cannot
  // and does not prove what the model then writes. Position is deliberately
  // not asserted, so an implementer is free to pass the kind however reads
  // best.
  it("passes an APPLIED course kind through to the rubric generator", async () => {
    await lmsRubricStep.run(
      {
        hubCourse: "course-1",
        description: "An applied, no-code ethical hacking course.",
        schedule: [{ week: 1, topic: "Rules of Engagement", summary: "", assignmentTitle: "", testName: "" }],
        courseKind: "applied",
      },
      testHelpers(),
      noop
    );

    expect(generateCourseRubricFromScheduleAction).toHaveBeenCalled();
    const args = vi.mocked(generateCourseRubricFromScheduleAction).mock.calls[0] as unknown as unknown[];
    expect(args, "the resolved course kind never reached the rubric generator").toContain("applied");
  });

  // OVER-REACH GUARD (fails today for the same missing-wiring reason, and must
  // keep passing after the fix): a coding course must not be told it is
  // applied.
  it("passes a CODING course kind through to the rubric generator", async () => {
    await lmsRubricStep.run(
      {
        hubCourse: "course-1",
        description: "A programming course.",
        schedule: [{ week: 1, topic: "Sorting", summary: "", assignmentTitle: "", testName: "" }],
        courseKind: "coding",
      },
      testHelpers(),
      noop
    );

    const args = vi.mocked(generateCourseRubricFromScheduleAction).mock.calls[0] as unknown as unknown[];
    expect(args).toContain("coding");
    expect(args).not.toContain("applied");
  });
});

// D (HANDOFF.md): lms-rubric was AUDITED against entry 217's Canvas-only
// guard and found already safe - no production change. Its Canvas call is
// double-wrapped: createRubricAction (app/actions/canvas-files-bulk.ts)
// already catches canvas-core.ts's resolveCourse throw (the exact "wrong
// LMS" shape entry 217 fixed for lms-wipe/lms-modules/lms-populate/
// lms-assignments - "Could not read a course from that URL. Expected a link
// like .../courses/123.") into a `{ error }` return, and THIS step's own
// try/catch (steps.rubrics.ts, the `if (course) { try { ... } catch (err) { ...
// } }` block) turns that into a note. So a bare throw never reaches the run
// loop here - a prior, independent audit (entry 155) reached the same
// conclusion. This is the pinning test the audit calls for: it proves the
// degradation contract by observation (resolves, reports success, notes the
// real failure), not by re-reading the source, so a future refactor cannot
// silently turn this into a thrown error (which would cascade to every step
// bound to this one's rubricFiles output - entry 217's own failure class) or
// a silently swallowed note (which would hide a real LMS failure from the
// instructor).
describe("lms-rubric: an LMS save failure degrades to a note, never a throw (item D, entry 217 audit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Rubric generation itself must succeed so this test exercises the LMS-
    // save catch specifically, not the earlier, unrelated "Rubric skipped"
    // catch (steps.rubrics.ts's outer try/catch around generation/parsing).
    vi.mocked(generateCourseRubricFromScheduleAction).mockResolvedValue(PARSEABLE_RUBRIC);
  });

  it("resolves with a successful, populated result and a note carrying the real Canvas error - never throws, never a generic placeholder", async () => {
    // The exact message canvas-core.ts's resolveCourse throws for a
    // non-Canvas-shaped course URL. createRubricAction already catches this
    // into `{ error: CANVAS_ERROR }` in production; the mock stands in for
    // that already-proven catch so this test isolates the step's OWN
    // handling of it.
    const CANVAS_ERROR = "Could not read a course from that URL. Expected a link like .../courses/123.";
    vi.mocked(createRubricAction).mockResolvedValue({ error: CANVAS_ERROR });

    // Capture the promise once so a throw is observed exactly where it would
    // occur in production (inside the run loop's own await) rather than
    // being masked by a second, separate invocation.
    const run = lmsRubricStep.run(
      {
        course: "https://canvas.example.edu/ultra/courses/_33114_1/outline",
        description: "An applied, no-code ethical hacking course.",
        schedule: [{ week: 1, topic: "Rules of Engagement", summary: "", assignmentTitle: "", testName: "" }],
      },
      testHelpers(),
      noop
    );

    // 1. Does not throw - the LMS failure never escapes as a bare rejection.
    await expect(run).resolves.toBeDefined();
    const result = await run;

    // 2. Reports success, not the failure-shaped result: rubricFiles still
    // carries the actually-generated document (the "Rubric skipped" early-out
    // returns rubricFiles: [] instead - this proves that path was NOT taken).
    const rubricFiles = result.outputs.rubricFiles as Array<{ name: string }>;
    expect(rubricFiles).toHaveLength(1);
    expect(rubricFiles[0].name).toBe("Grading Rubric.docx");

    // 3. The failure is surfaced as a NOTE, not silently dropped, and it
    // carries the REAL failure text rather than a generic placeholder (the
    // step's own fallback text for a non-Error throw is "unknown error" -
    // asserting the real message rules that fallback out too). Narrow
    // StepRunSummary's union the same way steps.grading-repos.grade-repo.test.ts
    // does - lms-rubric only ever returns the "text" summary kind, but the
    // type is a union so a bare `.text` does not typecheck.
    const summaryText = result.summary.kind === "text" ? result.summary.text : "";
    expect(summaryText).toContain(`LMS save failed (${CANVAS_ERROR})`);
    expect(summaryText).not.toContain("unknown error");
  });
});
