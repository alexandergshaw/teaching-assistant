import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: mocks.createServiceClient }));
import { listDiscussionRostersAction, saveDiscussionRosterAction } from "./discussion-rosters";

function client(data: unknown, error: unknown = null) {
  const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.is.mockReturnValue(q); q.update.mockReturnValue(q);
  q.order.mockResolvedValue({ data, error }); q.maybeSingle.mockResolvedValue({ data, error });
  mocks.createServiceClient.mockReturnValue({ from: vi.fn(() => q) });
  return q;
}

describe("discussion roster actions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "owner-a" }); });
  it("scopes reads to the authenticated owner and surfaces database errors", async () => {
    const q = client([{ id: "course-1", name: "Course", roster: "Ada", course_code: "CS1", term: "Fall", institution: "College" }]);
    expect(await listDiscussionRostersAction()).toEqual({ rosters: [{ id: "course-1", name: "Course", roster: "Ada", courseCode: "CS1", term: "Fall", institution: "College" }] });
    expect(q.eq).toHaveBeenCalledWith("user_id", "owner-a");
    client(null, { message: "unavailable" }); expect(await listDiscussionRostersAction()).toHaveProperty("error");
  });
  it("writes only the roster with owner, course, and source equality predicates", async () => {
    const q = client({ roster: "Ada | ada\nGrace" });
    expect(await saveDiscussionRosterAction({ courseId: "course-1", expectedRoster: "Ada | ada", names: ["Ada", "Grace"] })).toEqual({ roster: "Ada | ada\nGrace" });
    expect(q.update).toHaveBeenCalledWith({ roster: "Ada | ada\nGrace", updated_at: expect.any(String) });
    expect(q.eq).toHaveBeenCalledWith("user_id", "owner-a"); expect(q.eq).toHaveBeenCalledWith("id", "course-1"); expect(q.eq).toHaveBeenCalledWith("roster", "Ada | ada");
  });
  it("uses IS NULL for an empty source and reports a lost update instead of overwriting", async () => {
    const q = client(null);
    expect(await saveDiscussionRosterAction({ courseId: "course-1", expectedRoster: null, names: ["Ada"] })).toHaveProperty("error");
    expect(q.is).toHaveBeenCalledWith("roster", null);
  });
  it("does not touch storage on failed authentication or unsafe edits", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("no auth"));
    expect(await listDiscussionRostersAction()).toHaveProperty("error");
    expect(await saveDiscussionRosterAction({ courseId: "course-1", expectedRoster: "Ada | ada", names: [] })).toHaveProperty("error");
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});
