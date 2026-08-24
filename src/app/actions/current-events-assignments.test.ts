import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// The "use server" boundary for the current-events-assignment control
// (docs/current-events-assignment-from-modules-acceptance-criteria.md,
// section 3b - D3, D4). Both server-side dependencies (auth, the course-row
// resolver) and the sibling generator (1B, current-events-assignment-generator.ts)
// are mocked, so the fan-out/aggregation logic in THIS file runs for real
// without a Supabase session or a model call.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("./lms-generation-course-row", () => ({
  resolveGenerationCourseRow: vi.fn(),
}));

vi.mock("./current-events-assignment-generator", () => ({
  generateCurrentEventsAssignmentForModule: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { resolveGenerationCourseRow } from "./lms-generation-course-row";
import { generateCurrentEventsAssignmentForModule } from "./current-events-assignment-generator";
import {
  readCourseDeadlineContextAction,
  generateCurrentEventsAssignmentsAction,
  type CurrentEventsGenerationRequest,
} from "./current-events-assignments";

// A partial Course fixture, cast with `as never` at each call site exactly
// like FAKE_COURSE does in lms-generation.fixtures.ts (that shared fixture
// cannot be reused directly here - it deliberately omits startDate/
// assignmentDueRule/description/topicOutline/courseCode, the very fields
// this action's contract is built around) - only the fields this action
// actually reads need real values; the other ~35 required Course fields
// would add nothing but noise.
const baseCourse = {
  id: "course-1",
  name: "Intro to Testing",
  courseCode: "CS 101",
  institution: "State U",
  startDate: "2026-01-05",
  description: "A testing course.",
  topicOutline: "Loops, Recursion",
  courseKind: "coding",
  assignmentDueRule: "sun|23:59",
};

const requests: CurrentEventsGenerationRequest[] = [
  { moduleId: 1, moduleName: "Module 01: Loops", itemTitles: ["Loop basics"] },
  { moduleId: 2, moduleName: "Module 02: Recursion", itemTitles: [] },
  { moduleId: 3, moduleName: "Module 03: Sorting", itemTitles: ["Bubble sort"] },
];

describe("readCourseDeadlineContextAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns only the two raw columns on a resolved course", async () => {
    vi.mocked(resolveGenerationCourseRow).mockResolvedValue({ course: baseCourse } as never);

    const result = await readCourseDeadlineContextAction("https://canvas.example.com/courses/1");

    expect(result).toEqual({ startDate: "2026-01-05", assignmentDueRule: "sun|23:59" });
  });

  // W2 / D9: a course with no start date is a NORMAL success shape (a real
  // object with startDate: null), never an error - it must stay
  // distinguishable in SHAPE from the "course cannot resolve at all" case
  // below, which returns { error }. Collapsing the two would send an
  // instructor whose course merely lacks a start date to the wrong message.
  it("returns startDate: null (not an error) when the course has no start date", async () => {
    vi.mocked(resolveGenerationCourseRow).mockResolvedValue({
      course: { ...baseCourse, startDate: null },
    } as never);

    const result = await readCourseDeadlineContextAction("https://canvas.example.com/courses/1");

    expect(result).toEqual({ startDate: null, assignmentDueRule: "sun|23:59" });
    expect(result).not.toHaveProperty("error");
  });

  // W2 / D9's other distinguishable reason: the course cannot be resolved at
  // all. This MUST be an { error } shape, structurally different from the
  // no-start-date case above (which is a plain object with a null field).
  it("returns a top-level { error } - not a null-field object - when the course cannot resolve at all", async () => {
    vi.mocked(resolveGenerationCourseRow).mockResolvedValue({
      error: "No saved course is linked to https://canvas.example.com/courses/1.",
    });

    const result = await readCourseDeadlineContextAction("https://canvas.example.com/courses/1");

    expect(result).toEqual({ error: "No saved course is linked to https://canvas.example.com/courses/1." });
    expect(result).not.toHaveProperty("startDate");
  });

  it("never throws - a rejected resolve is caught and reported as { error }", async () => {
    vi.mocked(resolveGenerationCourseRow).mockRejectedValue(new Error("boom"));

    const result = await readCourseDeadlineContextAction("https://canvas.example.com/courses/1");

    expect(result).toEqual({ error: "boom" });
  });
});

describe("generateCurrentEventsAssignmentsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    vi.mocked(resolveGenerationCourseRow).mockResolvedValue({ course: baseCourse } as never);
  });

  // D3: ONE requireOwner() and ONE course-row resolve for N requests, never N
  // of each. Sabotage: change the assertion to `toBe(3)` and this test goes
  // red while the implementation (correctly) still calls each exactly once -
  // confirming the test can actually fail, not just pass by construction.
  it("calls requireOwner and resolveGenerationCourseRow exactly once for three requests", async () => {
    vi.mocked(generateCurrentEventsAssignmentForModule).mockResolvedValue({ body: "some body" });

    await generateCurrentEventsAssignmentsAction("https://canvas.example.com/courses/1", requests);

    expect(requireOwner).toHaveBeenCalledTimes(1);
    expect(resolveGenerationCourseRow).toHaveBeenCalledTimes(1);
    expect(generateCurrentEventsAssignmentForModule).toHaveBeenCalledTimes(3);
  });

  it("resolves courseKind once from the course row and passes it identically to every call", async () => {
    vi.mocked(resolveGenerationCourseRow).mockResolvedValue({
      course: { ...baseCourse, courseKind: "applied" },
    } as never);
    vi.mocked(generateCurrentEventsAssignmentForModule).mockResolvedValue({ body: "some body" });

    await generateCurrentEventsAssignmentsAction("https://canvas.example.com/courses/1", requests);

    const calls = vi.mocked(generateCurrentEventsAssignmentForModule).mock.calls;
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call[2]).toBe("applied");
    }
  });

  // AC15: one module's generation REJECTION must not abort its siblings, and
  // each outcome carries its OWN reason. Sabotage: change the middle
  // module's expected status to "ok" and this test goes red because the
  // implementation correctly reports it as "failed".
  it("keeps every sibling outcome intact when one module's generator call rejects, with its own reason", async () => {
    vi.mocked(generateCurrentEventsAssignmentForModule)
      .mockResolvedValueOnce({ body: "body for module 1" })
      .mockRejectedValueOnce(new Error("model timed out for module 2"))
      .mockResolvedValueOnce({ body: "body for module 3" });

    const result = await generateCurrentEventsAssignmentsAction("https://canvas.example.com/courses/1", requests);

    expect(result).toEqual({
      outcomes: [
        { moduleId: 1, status: "ok", body: "body for module 1" },
        { moduleId: 2, status: "failed", reason: "model timed out for module 2" },
        { moduleId: 3, status: "ok", body: "body for module 3" },
      ],
    });
  });

  // A generator returning { error } (not throwing) must ALSO map to
  // status: "failed" - the outer Promise.allSettled sees this as "fulfilled",
  // so this path is a distinct branch from the rejection path above and needs
  // its own test. Sabotage: swap `status: "failed"` for `status: "ok"` in the
  // expectation and this test goes red.
  it("maps a generator { error } result to status: failed, not a thrown error", async () => {
    vi.mocked(generateCurrentEventsAssignmentForModule)
      .mockResolvedValueOnce({ body: "body for module 1" })
      .mockResolvedValueOnce({ error: "Current events assignment generation returned empty response for \"Module 02: Recursion\"." })
      .mockResolvedValueOnce({ body: "body for module 3" });

    const result = await generateCurrentEventsAssignmentsAction("https://canvas.example.com/courses/1", requests);

    expect(result).toEqual({
      outcomes: [
        { moduleId: 1, status: "ok", body: "body for module 1" },
        {
          moduleId: 2,
          status: "failed",
          reason: 'Current events assignment generation returned empty response for "Module 02: Recursion".',
        },
        { moduleId: 3, status: "ok", body: "body for module 3" },
      ],
    });
  });

  // The top-level { error } path when the course row cannot resolve at all -
  // must be a `{ outcomes }`-less shape, distinguishable from a run that
  // produced per-module failures (which still returns `{ outcomes: [...] }`).
  // This is ALSO the W2-third-reason distinction from readCourseDeadlineContextAction's
  // own no-start-date case, mirrored here for the generation action.
  it("returns a top-level { error }, with no generator call made, when the course row cannot resolve", async () => {
    vi.mocked(resolveGenerationCourseRow).mockResolvedValue({
      error: "No saved course is linked to https://canvas.example.com/courses/1.",
    });

    const result = await generateCurrentEventsAssignmentsAction("https://canvas.example.com/courses/1", requests);

    expect(result).toEqual({ error: "No saved course is linked to https://canvas.example.com/courses/1." });
    expect(result).not.toHaveProperty("outcomes");
    expect(generateCurrentEventsAssignmentForModule).not.toHaveBeenCalled();
  });

  it("returns an empty outcomes array without resolving the course row when there are no requests", async () => {
    const result = await generateCurrentEventsAssignmentsAction("https://canvas.example.com/courses/1", []);

    expect(result).toEqual({ outcomes: [] });
    expect(resolveGenerationCourseRow).not.toHaveBeenCalled();
  });

  it("never throws - a rejected course-row resolve is caught and reported as { error }", async () => {
    vi.mocked(resolveGenerationCourseRow).mockRejectedValue(new Error("supabase unavailable"));

    const result = await generateCurrentEventsAssignmentsAction("https://canvas.example.com/courses/1", requests);

    expect(result).toEqual({ error: "supabase unavailable" });
  });
});

// D4's structural guard, sabotage-checkable independent of any mock: this
// file must be STRUCTURALLY INCAPABLE of computing a deadline. Scans the
// file's own TEXT (never imports it, since the guard is about what the file
// contains, not what it exports) for the three things D4 forbids.
//
// The file's own doc comments NAME ".toISOString()", "assignment-due-rule.ts"
// and "current-events-assignment-plan.ts" in prose explaining WHY the guard
// exists (D4's rationale paragraph) - a naive raw-text scan would flag its
// own explanation as a violation. stripComments removes // line comments and
// /* */ block comments first (this file has no string literal containing
// either sequence, so the strip is exact here), so the checks below examine
// only CODE - real import specifiers and real `.toISOString(` calls, never a
// comment that merely discusses them.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("D4 structural guard: this file cannot compute a deadline", () => {
  const rawSourceText = fs.readFileSync(path.resolve(__dirname, "current-events-assignments.ts"), "utf-8");
  const codeOnly = stripComments(rawSourceText);

  it("contains no .toISOString( call in code", () => {
    expect(codeOnly).not.toMatch(/\.toISOString\(/);
  });

  it("does not import the assignment-due-rule module in code", () => {
    expect(codeOnly).not.toMatch(/from\s+["'][^"']*assignment-due-rule["']/);
  });

  it("does not import the wave-2 plan module in code", () => {
    expect(codeOnly).not.toMatch(/from\s+["'][^"']*current-events-assignment-plan["']/);
  });

  // Sabotage-checkable canary: the guard's own rationale comments DO mention
  // all three forbidden strings in prose - if this test ever fails, either
  // the comments were removed (fine) or stripComments stopped stripping
  // comments (a real regression in the guard itself, which would let a real
  // violation slip through unnoticed).
  it("canary: the raw (unstripped) source does mention the forbidden strings in its own comments", () => {
    expect(rawSourceText).toMatch(/\.toISOString\(/);
    expect(rawSourceText).toMatch(/assignment-due-rule/);
    expect(rawSourceText).toMatch(/current-events-assignment-plan/);
  });

  // Canary: proves the scan above is actually reading real, substantial
  // source text and not silently matching against an empty or truncated
  // string (see AGENTS.md's emoji-scan lesson on scanners that report
  // "clean" without checking anything).
  it("read more than 500 characters of real source", () => {
    expect(rawSourceText.length).toBeGreaterThan(500);
  });
});
