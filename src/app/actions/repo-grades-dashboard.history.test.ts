import { beforeEach, expect, it, vi } from "vitest";
import { discoverRepoGradeSources } from "@/lib/repo-grades-dashboard/discovery";
import { readRepoGradeHistoryForOwner, REPO_GRADE_HISTORY_PAGE_SIZE } from "@/lib/repo-grades-dashboard/ledger";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { createClient } from "@/lib/supabase/server";
import { readRepoGradeHistoryAction } from "./repo-grades-dashboard";

vi.mock("@/lib/repo-grades-dashboard/discovery", () => ({ discoverRepoGradeSources: vi.fn() }));
vi.mock("@/lib/repo-grades-dashboard/ledger", async (original) => ({
  ...await original<typeof import("@/lib/repo-grades-dashboard/ledger")>(),
  readRepoGradeHistoryForOwner: vi.fn(),
}));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));

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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: account }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue(ownerRow);
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
