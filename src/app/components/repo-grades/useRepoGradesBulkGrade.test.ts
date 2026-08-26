// Tests for the U12.50 sequential rubric-setup prologue in
// useRepoGradesBulkGrade.ts. That hook itself (runBulkGrade, the pool, all
// React state) cannot be exercised here: this project's vitest runs in the
// "node" environment with no jsdom/@testing-library/react (see
// vitest.config.ts, and the precedent in
// caption-studio-wiring.structure.test.ts for why a render test is not an
// option in this codebase). What CAN be tested without rendering is
// establishSharedRubric - the pure retry algorithm the hook extracted for
// exactly this reason: it takes its "grade one target" step as a plain
// callback rather than reaching into gradeRepoAction/React state itself, so a
// fake `attempt` here stands in for a real network call.
//
// Not covered by these tests (would require rendering the hook): that
// runBulkGrade wires `attempt` to gradeOneTarget/gradeRepoAction correctly,
// and that the pool below the prologue (`runWorker`, `cursor`) actually
// resumes from `consumed` rather than re-grading. Those two are one-line
// wiring at the call site (`(target) => gradeOneTarget(target, rubric)`,
// `cursor = prologue.consumed`) verifiable by reading
// useRepoGradesBulkGrade.ts directly; extracting the pool into a similarly
// pure helper would be what closes that remaining gap.

import { describe, it, expect } from "vitest";
import { establishSharedRubric, type RubricAttemptResult } from "./useRepoGradesBulkGrade";
import type { BulkGradeTarget } from "./repoGradesBulkGrade";

function target(repo: string): BulkGradeTarget {
  return { repo, folder: "week-1" };
}

describe("establishSharedRubric", () => {
  it("typed-rubric path: a non-blank rubric short-circuits without trying any target", async () => {
    const targets = [target("org/a"), target("org/b")];
    const attempted: string[] = [];
    const attempt = async (t: BulkGradeTarget): Promise<RubricAttemptResult> => {
      attempted.push(t.repo);
      return { rubricUsed: "should never be reached" };
    };

    const result = await establishSharedRubric(targets, "instructor's own rubric text", attempt, () => {
      throw new Error("onAttempted must not fire when the rubric is already non-blank");
    });

    expect(result).toEqual({ sharedRubric: "instructor's own rubric text", consumed: 0 });
    expect(attempted).toEqual([]);
  });

  it("first target fails then second succeeds: retries past the failure, consumes exactly two, never re-tries the first", async () => {
    const targets = [target("org/first-fails"), target("org/second-succeeds"), target("org/third-untouched")];
    const attempted: string[] = [];
    const attempt = async (t: BulkGradeTarget): Promise<RubricAttemptResult> => {
      attempted.push(t.repo);
      if (t.repo === "org/first-fails") return { rubricUsed: null };
      return { rubricUsed: "generated from org/second-succeeds" };
    };
    let onAttemptedCalls = 0;

    const result = await establishSharedRubric(targets, "", attempt, () => {
      onAttemptedCalls += 1;
    });

    expect(attempted).toEqual(["org/first-fails", "org/second-succeeds"]);
    expect(result).toEqual({ sharedRubric: "generated from org/second-succeeds", consumed: 2 });
    expect(onAttemptedCalls).toBe(2);
  });

  it("every target fails: the run ends honestly rather than looping - rubric stays blank, every target tried exactly once", async () => {
    const targets = [target("org/a"), target("org/b"), target("org/c")];
    const attempted: string[] = [];
    const attempt = async (t: BulkGradeTarget): Promise<RubricAttemptResult> => {
      attempted.push(t.repo);
      return { rubricUsed: null };
    };
    let onAttemptedCalls = 0;

    const result = await establishSharedRubric(targets, "", attempt, () => {
      onAttemptedCalls += 1;
    });

    expect(attempted).toEqual(["org/a", "org/b", "org/c"]);
    expect(result).toEqual({ sharedRubric: "", consumed: 3 });
    expect(onAttemptedCalls).toBe(3);
  });

  it("no target is graded twice: attempt is called with each target's own identity exactly once, in order", async () => {
    const targets = [target("org/x"), target("org/y")];
    const seen = new Map<string, number>();
    const attempt = async (t: BulkGradeTarget): Promise<RubricAttemptResult> => {
      seen.set(t.repo, (seen.get(t.repo) ?? 0) + 1);
      return { rubricUsed: null };
    };

    await establishSharedRubric(targets, "", attempt, () => {});

    expect(seen.get("org/x")).toBe(1);
    expect(seen.get("org/y")).toBe(1);
    expect(seen.size).toBe(2);
  });

  it("an empty target list resolves immediately with the rubric unchanged", async () => {
    const attempt = async (): Promise<RubricAttemptResult> => {
      throw new Error("attempt must not be called with no targets");
    };

    const result = await establishSharedRubric([], "", attempt, () => {
      throw new Error("onAttempted must not fire with no targets");
    });

    expect(result).toEqual({ sharedRubric: "", consumed: 0 });
  });
});
