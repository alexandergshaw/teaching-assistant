import { beforeEach, describe, expect, it, vi } from "vitest";
const { owner, rpc, retry } = vi.hoisted(() => ({ owner: vi.fn(), rpc: vi.fn(), retry: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: owner }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
import { instructorReviewAction, instructorReviewEligibilityAction } from "./repo-grade-instructor-review";
const base = { courseId: "course", accountId: "owner", generation: 7, sourceSha: "a".repeat(40) };
const criteria = ["one", "two", "three", "four"].map(area => ({ area, score: 18.75, note: "Evidence" }));
describe("instructor review action", () => {
  beforeEach(() => { vi.clearAllMocks(); owner.mockResolvedValue({ id: "owner" }); retry.mockResolvedValue({ data: true, error: null }); rpc.mockReturnValue({ retry }); });
  it("uses the authenticated owner, expected revision, and no automatic retry", async () => {
    expect(await instructorReviewAction({ ...base, criteria, feedback: "Reviewed", expectedReviewId: 9 })).toBe(true);
    expect(rpc).toHaveBeenCalledWith("repo_grade_save_instructor_review", expect.objectContaining({ p_user_id: "owner", p_expected_review_id: 9, p_source_sha: base.sourceSha }));
    expect(retry).toHaveBeenCalledWith(false);
  });
  it("refuses an account change and invalid scores before dispatch", async () => {
    await expect(instructorReviewAction({ ...base, accountId: "other", criteria, feedback: "Reviewed" })).rejects.toThrow();
    await expect(instructorReviewAction({ ...base, criteria: [{ ...criteria[0], score: 26 }, ...criteria.slice(1)], feedback: "Reviewed" })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not retry an uncertain write", async () => {
    retry.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(instructorReviewAction({ ...base, criteria, feedback: "Reviewed" })).rejects.toThrow("could not be confirmed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("only exposes the review control when the server confirms the exact saved attempt", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await instructorReviewEligibilityAction(base)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("repo_grade_instructor_review_eligible", { p_user_id: "owner", p_course_id: "course", p_generation: 7, p_source_sha: base.sourceSha });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await instructorReviewEligibilityAction(base)).toBe(false);
    expect(await instructorReviewEligibilityAction({ ...base, accountId: "other" })).toBe(false);
  });});

