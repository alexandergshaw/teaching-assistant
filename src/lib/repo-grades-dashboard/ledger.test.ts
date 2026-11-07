import { isDeepStrictEqual } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAppOwner } from "@/lib/supabase/auth";
import {
  beginRepoGradeDispatch, claimRepoGrade, listOrphanedRepoGradeReservations, readRepoGradeHistory, reconcileEndedRepoGrade, settleRepoGrade,
} from "./ledger";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));

const token = "8d74ee61-463c-4b3f-af5d-5fc9b55023c1";
const automaticRequest = {
  mode: "automatic" as const,
  repo: "org/repo",
  folder: "",
  courseId: "course",
  courseConfig: {
    github_org: "org",
    repos: [{ repo: "org/repo", branch: "main" }],
    rubric_name: null,
    rubric_data: null,
    repo_module_pairing: null,
    student_repos: [],
  },
  sourceRef: "main",
  sha: "a".repeat(40),
  cohort: {
    cohortId: token,
    receipt: {
      accountId: "owner", courseId: "course", folder: "",
      configurationFingerprint: "b".repeat(64), rubric: "Exact  rubric",
      rubricFingerprint: "c".repeat(64), profileFingerprint: "d".repeat(64),
    },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAppOwner).mockResolvedValue({ id: "owner", email: "owner@example.test" });
});

describe("repository grading ledger RPC boundary", () => {
  it("routes a prepared-partial recovery through a live run and lease fence", async () => {
    rpc.mockReturnValue({ retry: () => Promise.resolve({ data: { status: "claimed", generation: 42, token }, error: null }) });
    await expect(claimRepoGrade({ ...automaticRequest, mode: "retry", recoveryRun: { runId: token, lease: token } }))
      .resolves.toEqual({ status: "claimed", claim: { mode: "retry", generation: 42, token } });
    expect(rpc).toHaveBeenCalledWith("repo_grade_claim_prepared_recovery", expect.objectContaining({
      p_run_id: token, p_lease: token, p_user_id: "owner", p_repo: "org/repo", p_source_sha: automaticRequest.sha,
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_mode");
    await expect(claimRepoGrade({ ...automaticRequest, mode: "retry", recoveryRun: { runId: "invalid", lease: token } }))
      .resolves.toEqual({ status: "forbidden" });
  });
  it("binds an explicit regrade claim to the exact live run and lease", async () => {
    rpc.mockReturnValue({ retry: () => Promise.resolve({ data: { status: "claimed", generation: 42, token }, error: null }) });
    const targetedRun = { runId: token, lease: token };
    await expect(claimRepoGrade({ ...automaticRequest, mode: "retry", targetedRun })).resolves.toEqual({
      status: "claimed", claim: { mode: "retry", generation: 42, token },
    });
    expect(rpc).toHaveBeenCalledWith("repo_grade_claim_targeted_regrade", expect.objectContaining({
      p_run_id: token, p_lease: token, p_user_id: "owner", p_repo: "org/repo", p_source_sha: automaticRequest.sha,
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_mode");
  });
  it("sends the authorized account and exact automatic plan, preserving root folder identity", async () => {
    rpc.mockResolvedValue({ data: { status: "claimed", generation: 42, token }, error: null });
    await expect(claimRepoGrade(automaticRequest)).resolves.toEqual({
      status: "claimed", claim: { mode: "automatic", generation: 42, token },
    });
    expect(rpc).toHaveBeenCalledWith("repo_grade_claim_tracked", {
      p_user_id: "owner", p_course_id: "course", p_repo: "org/repo", p_folder: "",
      p_mode: "automatic", p_source_ref: "main", p_source_sha: automaticRequest.sha,
      p_course_config: automaticRequest.courseConfig, p_cohort_id: token, p_receipt: automaticRequest.cohort.receipt,
    });
  });

  it("rejects a receipt from another course before calling the database", async () => {
    const { cohort } = automaticRequest;
    await expect(claimRepoGrade({
      ...automaticRequest, cohort: { ...cohort, receipt: { ...cohort.receipt, courseId: "other-course" } },
    })).resolves.toEqual({ status: "configuration-changed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves a database rejection when saved scope differs despite an unchanged timestamp", async () => {
    const updatedAt = "2026-11-05T12:00:00Z";
    const planned = { updatedAt, config: automaticRequest.courseConfig };
    const current = { updatedAt, config: { ...planned.config, repos: [{ repo: "org/other", branch: "main" }] } };
    rpc.mockImplementation((_name, args) => ({
      data: {
        status: isDeepStrictEqual(args.p_course_config, current.config) ? "claimed" : "configuration-changed",
      },
      error: null,
    }));
    await expect(claimRepoGrade({ ...automaticRequest, courseConfig: planned.config })).resolves.toEqual({
      status: "configuration-changed",
    });
    const args = rpc.mock.calls[0][1];
    expect(args.p_course_config).toEqual(planned.config);
    expect(args).not.toHaveProperty("p_course_updated_at");
  });

  it("uses the shared claim RPC for manual grading without assigning a fabricated course", async () => {
    rpc.mockResolvedValue({ data: { status: "busy" }, error: null });
    await expect(claimRepoGrade({ mode: "manual", repo: "org/repo" })).resolves.toEqual({ status: "busy" });
    expect(rpc).toHaveBeenCalledWith("repo_grade_claim_tracked", expect.objectContaining({
      p_user_id: "owner", p_course_id: null, p_folder: null, p_mode: "manual", p_cohort_id: null, p_receipt: null,
    }));
  });

  it("begins dispatch only with the authenticated claim binding and a valid remaining lease", async () => {
    const claim = { mode: "manual", generation: 42, token } as const;
    rpc.mockResolvedValueOnce({ data: 120_000, error: null }).mockResolvedValueOnce({ data: true, error: null });
    await expect(beginRepoGradeDispatch(claim)).resolves.toBe(120_000);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_begin_dispatch", {
      p_user_id: "owner", p_generation: 42, p_token: token,
    });
    await expect(beginRepoGradeDispatch(claim)).rejects.toThrow("Invalid repository grading dispatch response");
  });

  it("never requests a claim for an unauthorized caller", async () => {
    vi.mocked(requireAppOwner).mockRejectedValue(new Error("Unauthorized"));
    await expect(claimRepoGrade(automaticRequest)).rejects.toThrow("Unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on missing storage or ambiguous claim response without retrying the RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "internal credentials or arbitrary error" } });
    await expect(claimRepoGrade(automaticRequest)).rejects.toThrow(/^Repository grading storage is unavailable$/);
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValue({ data: { status: "claimed", generation: 42 }, error: null });
    await expect(claimRepoGrade(automaticRequest)).rejects.toThrow("Invalid repository grading admission response");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("preserves exact feedback, excludes unrelated result data and propagates a fenced rejection", async () => {
    const result = {
      score: 0, feedback: `  See https://example.test/lesson\r\n${"x".repeat(4100)}\t`,
      sections: { strengths: "  Worked well\n", improvements: "\tTry again", resubmitNotice: "", rawScore: " 0 / 10 " },
      rubric: [{ area: "Test", score: " 0 / 10 ", comment: "See https://example.test/example\n " }],
      executionOutput: "private",
    };
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, {
      outcome: "succeeded", inputsComplete: true, result,
    })).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith("repo_grade_settle", {
      p_user_id: "owner", p_generation: 42, p_token: token,
      p_outcome: "succeeded", p_inputs_complete: true, p_score: 0,
      p_feedback: result.feedback, p_rubric: result.rubric, p_feedback_sections: result.sections,
      p_feedback_retention: null,
    });
  });

  it("refuses an oversized result before sending any content to storage", async () => {
    await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, {
      outcome: "succeeded", inputsComplete: true,
      result: {
        score: 0, feedback: "private https://example.test", rubric: [],
        sections: { strengths: "x".repeat(16001), improvements: "", resubmitNotice: "", rawScore: "0/10" },
      },
    })).rejects.toThrow(/^Repository evaluation feedback cannot be retained \(strengths\)$/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records only a bounded field label when exact retention was refused", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, {
      outcome: "partial", feedbackRetention: "rubric",
    })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_settle", {
      p_user_id: "owner", p_generation: 42, p_token: token,
      p_outcome: "partial", p_inputs_complete: false, p_score: null, p_feedback: null, p_rubric: null,
      p_feedback_sections: null, p_feedback_retention: "rubric",
    });
  });

  it("rejects an unauthorized settlement before sending the private claim to storage", async () => {
    vi.mocked(requireAppOwner).mockRejectedValue(new Error("Unauthorized"));
    await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, {
      outcome: "partial", feedbackRetention: "overall",
    })).rejects.toThrow("Unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("settles no-submission as a terminal check with no grade", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await settleRepoGrade({ mode: "automatic", generation: 42, token }, {
      outcome: "no-submission", inputsComplete: true,
    });
    expect(rpc).toHaveBeenCalledWith("repo_grade_settle", expect.objectContaining({
      p_outcome: "no-submission", p_inputs_complete: true, p_score: null, p_feedback: null, p_rubric: null,
    }));
  });

  it("never converts an ambiguous settlement into a retry or a reconciliation", async () => {
    rpc.mockRejectedValue(new Error("lost response"));
    await expect(settleRepoGrade({ mode: "manual", generation: 42, token }, {
      outcome: "succeeded",
    })).rejects.toThrow("Repository grading storage is unavailable");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_settle", expect.anything());
  });

  it("scopes readback and explicit reconciliation to the authorized account", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: false, error: null });
    await expect(readRepoGradeHistory("other-course", 43)).rejects.toThrow("Repository grading course is unavailable");
    expect(rpc).toHaveBeenNthCalledWith(1, "repo_grade_history", {
      p_user_id: "owner", p_course_id: "other-course", p_before: 43,
    });
    await expect(reconcileEndedRepoGrade(42)).resolves.toBe(false);
    expect(rpc).toHaveBeenNthCalledWith(2, "repo_grade_reconcile", { p_user_id: "owner", p_generation: 42 });
  });

  it("lists only orphaned generation identifiers for the authorized account", async () => {
    rpc.mockResolvedValue({ data: [42], error: null });
    await expect(listOrphanedRepoGradeReservations()).resolves.toEqual([42]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_orphaned_reservations", { p_user_id: "owner" });
  });

  it("rejects invalid history rows or cursor order instead of silently losing coverage", async () => {
    const row = {
      generation: 42, repo: "org/repo", folder: "", source_ref: "main", source_sha: "a".repeat(40),
      profile_fingerprint: "b".repeat(64), status: "succeeded", claimed_at: "2026-10-11T12:00:00+00:00",
      settled_at: "2026-10-11T12:00:01+00:00", reconciled_at: null, score: 0, feedback: "", rubric: [],
    };
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(readRepoGradeHistory("course", 43)).resolves.toEqual([row]);
    const structured = {
      ...row, feedback: `See https://example.test/lesson\n${"x".repeat(4100)}\t`,
      rubric: [{ area: " Test ", score: " 0 / 10 ", comment: "a".repeat(500) }],
      feedback_sections: { strengths: "", improvements: "  Try again\r\n", resubmitNotice: "", rawScore: " 0 / 10 " },
      feedback_retention: null,
    };
    const partial = {
      ...row, status: "partial", score: null, feedback: null, rubric: null,
      feedback_sections: null, feedback_retention: "improvements",
    };
    rpc.mockResolvedValueOnce({ data: [structured, { ...row, generation: 41, feedback_sections: null },
      { ...partial, generation: 40 }], error: null });
    await expect(readRepoGradeHistory("course", 43)).resolves.toEqual([
      structured, { ...row, generation: 41, feedback_sections: null }, { ...partial, generation: 40 },
    ]);
    rpc.mockResolvedValueOnce({ data: [{ ...structured, feedback_retention: "strengths" }], error: null });
    await expect(readRepoGradeHistory("course", 43)).rejects.toThrow("Invalid repository grading history response");
    for (const data of [[row, row], [{ ...row, claimed_at: "invalid" }], [{ ...row, score: null }], [{ ...row, generation: 43 }]]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(readRepoGradeHistory("course", 43)).rejects.toThrow("Invalid repository grading history response");
    }
  });
});
