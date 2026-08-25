// The bound on gradeTileRepos/gradeOrgRepos's internal loops
// (docs/repo-grading-records-acceptance-criteria.md R1.5, and REGRESSION entry
// 342's recorded follow-up: "thread the runner's deadlineMs and honour it,
// instead of a constant").
//
// Why this is a real behaviour and not arithmetic trivia: these two functions
// loop over N repos inside ONE workflow step, and the runner's own deadline
// checks only fire BETWEEN steps - so nothing but this stops the step being
// hard-killed at the platform cap, and a hard kill persists NOTHING: no draft,
// no run log, no unattended report. The whole record this feature adds exists
// only if the loop ends while the process is still alive.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  generateModelAnswerAction: vi.fn(),
  gradeRepoAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  saveGradingDraftAction: vi.fn(),
  deleteGradingDraftAction: vi.fn(),
  findPendingGradingDraftForWorkflowAction: vi.fn(),
  generateFullCreditChecklistAction: vi.fn(),
  getInstitutionCountsAction: vi.fn(),
  getRepoTreeAction: vi.fn(),
  getFileTextAction: vi.fn(),
  listConfiguredInstitutionsAction: vi.fn(),
  listOrgReposAction: vi.fn(),
}));

import { repoGradingStopAt } from "./steps.grading-repos.helpers";

const START = 1_000_000;

describe("repoGradingStopAt", () => {
  it("honours the run's own deadline, reserving time to persist what it has", () => {
    // The cron route's real shape: a 60s cap, the runner deadline at +50s.
    const deadline = START + 50_000;
    const stopAt = repoGradingStopAt(deadline, START);

    // Strictly before the deadline - stopping AT it would leave no time to
    // write the draft and the report, recreating the exact failure.
    expect(stopAt).toBeLessThan(deadline);
    expect(stopAt).toBeGreaterThan(START);
  });

  // THE CASE THE HARDCODED CONSTANT GOT WRONG. Releases run first in the cron
  // tick under their own sub-budget (REGRESSION 339), so a grading step can
  // START with far less than the full window left. A fixed 45s budget measured
  // from the step's own start would sail straight past the run deadline and be
  // killed; the threaded deadline is an ABSOLUTE instant, so it shrinks
  // correctly.
  it("gives a late-starting step LESS time, not the same fixed budget", () => {
    const deadline = START + 50_000;
    const early = repoGradingStopAt(deadline, START);
    const late = repoGradingStopAt(deadline, START + 40_000);

    // Same absolute stop instant regardless of when the step began...
    expect(late).toBe(early);
    // ...which means a step starting 40s in gets ~2s, not another 45.
    expect(late - (START + 40_000)).toBeLessThan(45_000);
  });

  it("a deadline already passed stops the loop before the first repo", () => {
    const stopAt = repoGradingStopAt(START - 1, START);
    expect(stopAt).toBeLessThan(START);
  });

  // Absent means "no deadline is known" (an attended run), NOT "unlimited".
  // An unbounded loop is the one option that is definitely wrong.
  it("falls back to a bounded budget from the start when no deadline is threaded", () => {
    const stopAt = repoGradingStopAt(undefined, START);
    expect(stopAt).toBeGreaterThan(START);
    expect(Number.isFinite(stopAt)).toBe(true);
    // Measured from the step's own start, since there is no absolute instant
    // to measure against.
    expect(stopAt - START).toBe(45_000);
  });

  it("the threaded deadline WINS over the fallback - that is the whole change", () => {
    // A deadline far beyond the fallback window must extend the bound, not be
    // capped by the old constant.
    const generous = START + 300_000;
    expect(repoGradingStopAt(generous, START)).toBeGreaterThan(repoGradingStopAt(undefined, START));
    // And a deadline tighter than the fallback must shorten it.
    const tight = START + 5_000;
    expect(repoGradingStopAt(tight, START)).toBeLessThan(repoGradingStopAt(undefined, START));
  });
});
