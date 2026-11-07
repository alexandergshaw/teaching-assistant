import { beforeEach, expect, it, vi } from "vitest";
import { finishAutomaticRepoGrade } from "./automatic-store";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockReturnValue({ retry: () => ({ abortSignal: async () => ({ data: true, error: null }) }) });
});

it("sends a never-dispatched automatic claim only to the atomic retry transition", async () => {
  const work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course",
    repo: "org/repo", folder: "lab", ref: "main", sha: "a".repeat(40) } as const;
  expect(await finishAutomaticRepoGrade(work, "lease", {
    state: "github-throttled", rateLimit: { retryAtMs: null, primary: false },
    claim: { mode: "automatic", generation: 7, token: "claim-token" },
  })).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_automatic_retry_prepared_throttle", {
    p_user_id: "owner", p_run_id: "run", p_lease: "lease", p_course_id: "course",
    p_generation: 7, p_token: "claim-token", p_retry_at: null, p_primary_limit: false,
  });
});

it("refuses to release a non-automatic claim or discovery work", async () => {
  const work = { phase: "discovering", runId: "run", accountId: "owner", courseId: "course" } as const;
  expect(await finishAutomaticRepoGrade(work, "lease", {
    state: "github-throttled", rateLimit: { retryAtMs: null, primary: false },
    claim: { mode: "retry", generation: 7, token: "claim-token" },
  })).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("settles a preparation batch using the scoped progress transition", async () => {
  const work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course",
    repo: "org/repo", folder: "lab", ref: "main", sha: "a".repeat(40) } as const;
  const progress = { version: 1 as const, basis: "a".repeat(64), key: "b".repeat(64), instructions: "text", rows: [] };
  expect(await finishAutomaticRepoGrade(work, "lease", { state: "evidence-continue", basis: "c".repeat(64), progress })).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_automatic_continue_evidence", {
    p_run_id: "run", p_lease: "lease", p_user_id: "owner", p_course_id: "course", p_folder: "lab",
    p_basis: "c".repeat(64), p_progress: progress,
  });
});
