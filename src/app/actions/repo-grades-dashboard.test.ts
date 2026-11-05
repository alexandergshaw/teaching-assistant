import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { callLlm } from "@/lib/llm";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { discoverRepoGradeSources } from "@/lib/repo-grades-dashboard/discovery";
import * as discoveryMode from "@/lib/repo-grades-dashboard/discovery-mode";
import { readRepoGradeHistoryForOwner, REPO_GRADE_HISTORY_PAGE_SIZE } from "@/lib/repo-grades-dashboard/ledger";
import { readCurrentRepoGradeProfilesForOwner } from "@/lib/repo-grades-dashboard/profile-store";
import { evaluateRepoGrade } from "@/lib/repo-grade-evaluator";
import { planRepoGradeCourseAction, readRepoGradeHistoryAction, readRepoGradeStartupCoursesAction } from "./repo-grades-dashboard";

const { select, eq, maybeSingle } = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: vi.fn(),
}));
vi.mock("@/lib/supabase/courses.row", () => ({ table: () => ({ select }) }));
vi.mock("@/lib/repo-grades-dashboard/discovery", () => ({ discoverRepoGradeSources: vi.fn() }));
vi.mock("@/lib/repo-grade-evaluator", () => ({ evaluateRepoGrade: vi.fn() }));
vi.mock("@/lib/llm", async (original) => ({
  ...await original<typeof import("@/lib/llm")>(),
  callLlm: vi.fn(),
}));
vi.mock("@/lib/repo-grades-dashboard/profile-store", () => ({ readCurrentRepoGradeProfilesForOwner: vi.fn() }));
vi.mock("@/lib/repo-grades-dashboard/ledger", () => ({
  readRepoGradeHistoryForOwner: vi.fn(),
  REPO_GRADE_HISTORY_PAGE_SIZE: 100,
  claimRepoGrade: () => { throw new Error("Inventory preview attempted admission"); },
  settleRepoGrade: () => { throw new Error("Inventory preview attempted settlement"); },
}));

const courseId = "18d742a1-46a5-4b3f-af5d-5fc9b55023c1";
const account = { id: "owner", email: "owner@example.test" };
const ownerRow: AppUserRow = {
  ...account,
  displayName: null,
  status: "active",
  role: "owner",
  approvedAt: null,
  approvedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  statusChangedAt: null,
  statusChangedBy: null,
  roleGrantedBy: null,
};
const getUser = vi.fn();
const readReceipts = vi.fn();
const from = vi.fn();
const receiptQuery = {
  select: vi.fn(), eq: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), retry: readReceipts,
};

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: account }, error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue(ownerRow);
  vi.mocked(readCurrentRepoGradeProfilesForOwner).mockResolvedValue(new Map());
  vi.mocked(createServiceClient).mockReturnValue({ from } as never);
  from.mockReturnValue(receiptQuery);
  for (const method of ["select", "eq", "neq", "order", "limit", "abortSignal"] as const) {
    receiptQuery[method].mockReturnValue(receiptQuery);
  }
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ eq, maybeSingle });
});

afterEach(() => vi.restoreAllMocks());

it.each([
  { session: "signed out", user: null, role: "owner", message: "Not authorized. Sign in with an approved account." },
  { session: "active instructor", user: account, role: "instructor", message: "This action is limited to the workspace owner." },
] as const)("denies a $session caller before storage or GitHub", async ({ user, role, message }) => {
  getUser.mockResolvedValue({ data: { user }, error: null });
  vi.mocked(getAppUser).mockResolvedValue({ ...ownerRow, role });
  await expect(planRepoGradeCourseAction(courseId)).rejects.toThrow(message);
  await expect(readRepoGradeHistoryAction(courseId, account.id)).rejects.toThrow(message);
  await expect(readRepoGradeStartupCoursesAction(account.id)).resolves.toEqual({ status: "unknown", reason: "account-unavailable" });
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(readRepoGradeHistoryForOwner).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

it("fences startup inventory reads to the expected account and hides authorization errors", async () => {
  const unavailable = { status: "unknown", reason: "account-unavailable" };
  await expect(readRepoGradeStartupCoursesAction("another-account")).resolves.toEqual(unavailable);
  await expect(readRepoGradeStartupCoursesAction({ id: account.id })).resolves.toEqual(unavailable);
  getUser.mockRejectedValueOnce(new Error("private authorization transport error"));
  await expect(readRepoGradeStartupCoursesAction(account.id)).resolves.toEqual(unavailable);
  expect(from).not.toHaveBeenCalled();
});

it("returns the owned startup inventory without discovery, history, or evaluation", async () => {
  readReceipts.mockResolvedValue({
    data: [{ id: courseId, user_id: account.id, name: "Class name", github_org: "school" }], count: 1, error: null,
  });
  await expect(readRepoGradeStartupCoursesAction(account.id)).resolves.toEqual({
    status: "complete", courses: [{ accountId: account.id, courseId, displayName: "Class name", organization: "school" }],
  });
  expect(from).toHaveBeenCalledExactlyOnceWith("course_hub");
  expect(receiptQuery.eq).toHaveBeenCalledExactlyOnceWith("user_id", account.id);
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(readCurrentRepoGradeProfilesForOwner).not.toHaveBeenCalled();
  expect(readRepoGradeHistoryForOwner).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it("rejects browser scope objects and never discovers an unowned course", async () => {
  await expect(planRepoGradeCourseAction({ courseId, githubOrg: "external" } as unknown as string))
    .resolves.toEqual({ status: "course-unavailable" });
  expect(select).not.toHaveBeenCalled();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toEqual({ status: "course-unavailable" });
  expect(eq.mock.calls).toEqual([["user_id", "owner"], ["id", courseId]]);
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

it("reports that discovery is disabled for a configured course without reading profiles or contacting GitHub", async () => {
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  await expect(planRepoGradeCourseAction(courseId.toUpperCase())).resolves.toEqual({
    status: "planned",
    discovery: { status: "blocked", reason: "branch-aware-discovery-disabled" },
    execution: "runtime-unavailable",
    preview: { history: "not-read", targets: [] },
  });
  expect(eq.mock.calls).toEqual([["user_id", account.id], ["id", courseId]]);
  expect(readCurrentRepoGradeProfilesForOwner).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it("discloses partial coverage and hides course settings in the dormant preview", async () => {
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  const discovery = { status: "scanned" as const, enumerationComplete: false, repos: [source()] };
  vi.mocked(discoverRepoGradeSources).mockResolvedValue(discovery);
  await expect(planRepoGradeCourseAction(courseId))
    .resolves.toEqual({ status: "planned", discovery, execution: "runtime-unavailable", preview: { history: "not-read", targets: [] } });
  expect(discoverRepoGradeSources).toHaveBeenCalledExactlyOnceWith({ organization: "school", folderSources: new Map() });
  expect(from).not.toHaveBeenCalled();
});

it.each([null, "  "])("keeps mapping-only courses with organization %j outside automatic discovery", async (organization) => {
  maybeSingle.mockResolvedValue({ data: { github_org: organization, student_repos: ["external/repo"] }, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toEqual({
    status: "planned", discovery: { status: "not-configured" }, execution: "runtime-unavailable",
    preview: { history: "not-read", targets: [] },
  });
  expect(readCurrentRepoGradeProfilesForOwner).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

const sha = "a".repeat(40);
const currentSha = "b".repeat(40);

function source(folders = ["assignment"]) {
  return { status: "ready" as const, repo: "School/Repo", sourceRef: "Main", sourceCommit: currentSha, folders };
}

function receipt(generation: number, overrides: Record<string, unknown> = {}) {
  return {
    generation, user_id: account.id, course_id: courseId, repo: "school/repo", folder: "assignment",
    source_ref: "Main", source_sha: currentSha, mode: "automatic", status: "succeeded",
    claimed_at: new Date().toISOString(), ...overrides,
  };
}

function discover(...repos: Array<ReturnType<typeof source>>) {
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  vi.mocked(discoverRepoGradeSources).mockResolvedValue({ status: "scanned", enumerationComplete: true, repos });
}

it("uses compact owner/course history and matches exact discovered targets without enabling dispatch", async () => {
  discover(source(["assignment", "NoSubmission", "pending", "current-commit", "exact-folder", "exact-repo"]));
  const data = [
    receipt(10, { status: "failed", mode: "retry", profile_fingerprint: "new-settings" }),
    receipt(9, { folder: "NoSubmission", status: "partial", mode: "retry" }),
    receipt(8, { folder: "pending", status: "claimed" }),
    receipt(7, { folder: "pending", status: "failed" }),
    receipt(6, { folder: "current-commit", source_ref: "previous-ref", source_sha: sha }),
    receipt(4, { folder: "Exact-Folder", source_ref: "previous-ref" }),
    receipt(3, { folder: "exact-repo", repo: "school/other", source_ref: "previous-ref" }),
    receipt(2, { folder: "NoSubmission", source_ref: "previous-ref", status: "no-submission" }),
    receipt(1, { source_ref: "previous-ref", profile_fingerprint: "old-settings", feedback: "private", claim_token: "private" }),
  ];
  readReceipts.mockResolvedValue({ data, count: data.length, error: null });
  const result = await planRepoGradeCourseAction(courseId.toUpperCase());
  expect(from).toHaveBeenCalledExactlyOnceWith("repo_grade_attempts");
  expect(receiptQuery.select).toHaveBeenCalledExactlyOnceWith(
    "generation, user_id, course_id, repo, folder, source_ref, source_sha, mode, status, claimed_at", { count: "exact" },
  );
  expect(receiptQuery.eq.mock.calls).toEqual([["user_id", account.id], ["course_id", courseId]]);
  expect(receiptQuery.neq).toHaveBeenCalledExactlyOnceWith("mode", "manual");
  expect(receiptQuery.order).toHaveBeenCalledExactlyOnceWith("generation", { ascending: false });
  expect(readReceipts).toHaveBeenCalledExactlyOnceWith(false);
  expect(result).toMatchObject({ status: "planned", execution: "runtime-unavailable", preview: { history: "complete" } });
  if (result.status !== "planned") throw new Error("Expected preview");
  const work = new Map(result.preview.targets.map((target) => [target.folder, target]));
  expect(work.get("assignment")).toEqual({
    repo: "School/Repo", sourceRef: "Main", commit: currentSha, folder: "assignment", state: { status: "succeeded" },
  });
  expect(work.get("NoSubmission")?.state).toEqual({ status: "no-submission" });
  expect(work.get("pending")?.state).toEqual({ status: "claimed" });
  for (const folder of ["current-commit", "exact-folder", "exact-repo"]) {
    expect(work.get(folder)?.state).toEqual({ status: "blocked", reason: "runtime-unavailable" });
  }
  expect(JSON.stringify(result)).not.toMatch(/old-settings|new-settings|private|queued|running/);
  expect(readRepoGradeHistoryForOwner).not.toHaveBeenCalled();
});

it.each([
  { older: "succeeded", newer: "unknown", expected: "succeeded" },
  { older: "unknown", newer: "failed", expected: "unknown" },
  { older: "unknown", newer: "claimed", expected: "unknown" },
  { older: "claimed", newer: "partial", expected: "claimed" },
])("previews $expected for the same SHA across refs with an older $older and newer $newer", async ({ older, newer, expected }) => {
  discover(source());
  const data = [receipt(2, { status: newer }), receipt(1, { source_ref: "previous-ref", status: older })];
  readReceipts.mockResolvedValue({ data, count: data.length, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    execution: "runtime-unavailable",
    preview: { history: "complete", targets: [{ sourceRef: "Main", commit: currentSha, state: { status: expected } }] },
  });
});

it("classifies a stale claim as unknown and a proven empty history as runtime-blocked", async () => {
  discover(source());
  readReceipts.mockResolvedValueOnce({
    data: [receipt(1, { status: "claimed", claimed_at: "2026-01-01T00:00:00Z" })], count: 1, error: null,
  }).mockResolvedValueOnce({ data: [], count: 0, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    preview: { history: "complete", targets: [{ state: { status: "unknown" } }] },
  });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    preview: { history: "complete", targets: [{ state: { status: "blocked", reason: "runtime-unavailable" } }] },
  });
});

it.each([
  { label: "foreign owner", data: [receipt(2), receipt(1, { user_id: "other-owner" })], count: 2 },
  { label: "foreign course", data: [receipt(2), receipt(1, { course_id: "other-course" })], count: 2 },
  { label: "manual attempt", data: [receipt(2), receipt(1, { mode: "manual" })], count: 2 },
  { label: "unrecognized attempt status", data: [receipt(2), receipt(1, { status: "private" })], count: 2 },
  { label: "duplicate generation", data: [receipt(2), receipt(2)], count: 2 },
  { label: "missing body", data: null, count: 0 },
  { label: "missing count", data: [], count: null },
  { label: "truncated body", data: [receipt(1)], count: 2 },
  { label: "missing table", data: null, count: null, error: { message: "private database error" } },
])("keeps every target unknown with $label", async (result) => {
  discover(source());
  readReceipts.mockResolvedValue({ error: null, ...result });
  const preview = await planRepoGradeCourseAction(courseId);
  expect(preview).toMatchObject({
    status: "planned", execution: "runtime-unavailable", preview: {
      history: "unknown", targets: [{ state: { status: "blocked", reason: "history-unavailable" } }],
    },
  });
  expect(JSON.stringify(preview)).not.toContain("private");
});

it("requires an exact match at the receipt cap and fails closed on a thrown request", async () => {
  discover(source());
  const data = Array.from({ length: 1_000 }, (_, index) => receipt(1_001 - index));
  readReceipts.mockResolvedValueOnce({ data, count: 1_000, error: null })
    .mockResolvedValueOnce({ data, count: 1_001, error: null })
    .mockRejectedValueOnce(new Error("private transport failure"));
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    preview: { history: "complete", targets: [{ state: { status: "succeeded" } }] },
  });
  for (let request = 0; request < 2; request += 1) {
    await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
      preview: { history: "unknown", targets: [{ state: { status: "blocked", reason: "history-unavailable" } }] },
    });
  }
  expect(receiptQuery.limit.mock.calls).toEqual([[1_000], [1_000], [1_000]]);
});

it("fences the browser account and cursor before reading history", async () => {
  await expect(readRepoGradeHistoryAction(courseId, "another-account")).resolves.toEqual({ status: "course-unavailable" });
  await expect(readRepoGradeHistoryAction(courseId, "owner", -1)).resolves.toEqual({ status: "course-unavailable" });
  await expect(readRepoGradeHistoryAction("other", "owner")).resolves.toEqual({ status: "course-unavailable" });
  expect(readRepoGradeHistoryForOwner).not.toHaveBeenCalled();
});

it("projects one descending page and distinguishes zero, null, and unknown", async () => {
  const row = {
    repo: "org/repo", folder: "", source_ref: "main", source_sha: "a".repeat(40), profile_fingerprint: "b".repeat(64),
    claimed_at: "2026-10-11T12:00:00+00:00", settled_at: null, reconciled_at: null,
  };
  const sections = { strengths: "Good\nhttps://example.test/help", improvements: "  Improve timing", resubmitNotice: "", rawScore: "0/12" };
  const rubric = [{ area: "Timing", score: "0/12", comment: "Try again\nhttps://example.test/timing" }];
  vi.mocked(readRepoGradeHistoryForOwner).mockResolvedValueOnce(Array.from(
    { length: REPO_GRADE_HISTORY_PAGE_SIZE },
    (_, i) => i === 0
      ? { ...row, generation: 101, status: "succeeded", score: 0, feedback: "Feedback", rubric, feedback_sections: sections }
      : i === 1
        ? { ...row, generation: 100, status: "partial", score: null, feedback: null, rubric: null, feedback_retention: "strengths" }
      : { ...row, generation: 101 - i, status: "unknown", score: null, feedback: null, rubric: null },
  )).mockResolvedValueOnce([]);
  const result = await readRepoGradeHistoryAction(courseId, "owner", 102);
  expect(readRepoGradeHistoryForOwner).toHaveBeenCalledWith("owner", courseId, 102);
  expect(result).toMatchObject({ status: "loaded", nextBefore: 2 });
  if (result.status !== "loaded") throw new Error("Expected history");
  expect(result.rows[0]).toMatchObject({
    status: "succeeded", score: 0, settledAt: null, claimedAt: "2026-10-11T12:00:00.000Z",
    feedback: "Feedback", rubric, feedback_sections: sections, feedback_retention: null,
  });
  expect(result.rows[1]).toMatchObject({
    status: "partial", score: null, feedback: null, rubric: null, feedback_sections: null, feedback_retention: "strengths",
  });
  expect(result.rows[2]).toMatchObject({ status: "unknown", score: null, feedback: null, feedback_sections: null });
  await expect(readRepoGradeHistoryAction(courseId, "owner", 2)).resolves.toEqual({ status: "loaded", nextBefore: null, rows: [] });
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
});

it("distinguishes an unowned course from an unavailable history store without retrying", async () => {
  vi.mocked(readRepoGradeHistoryForOwner).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("missing migration"));
  await expect(readRepoGradeHistoryAction(courseId, "owner")).resolves.toEqual({ status: "course-unavailable" });
  await expect(readRepoGradeHistoryAction(courseId, "owner")).resolves.toEqual({ status: "storage-unavailable" });
  expect(readRepoGradeHistoryForOwner).toHaveBeenCalledTimes(2);
});
