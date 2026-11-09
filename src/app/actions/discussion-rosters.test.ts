import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: mocks.createServiceClient }));
import { listDiscussionRostersAction } from "./discussion-rosters";

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
  it("does not touch storage on failed authentication", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("no auth"));
    expect(await listDiscussionRostersAction()).toHaveProperty("error");
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });
});
