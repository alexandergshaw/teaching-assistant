import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cookie: vi.fn(), account: vi.fn(), course: vi.fn(), client: vi.fn(), list: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: mocks.account,
}));
vi.mock("@/lib/supabase/courses", () => ({ getCourse: mocks.course }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: mocks.client, createClient: mocks.cookie }));
vi.mock("@/lib/announcement-exemplars", () => ({ listAnnouncementLibraryEntries: mocks.list, saveAnnouncementLibraryEntry: mocks.save, deleteAnnouncementLibraryEntry: mocks.remove }));
import { listAnnouncementLibraryAction, saveAnnouncementLibraryEntryAction, deleteAnnouncementLibraryEntryAction } from "./announcement-library";
const courseId = "22222222-2222-4222-8222-222222222222";
const id = "11111111-1111-4111-8111-111111111111";
const input = { id, courseId, exemplarText: "Body", label: " Weekly ", expected: null };
const actions = [() => listAnnouncementLibraryAction(courseId), () => saveAnnouncementLibraryEntryAction(input), () => deleteAnnouncementLibraryEntryAction(courseId, id)];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockResolvedValue({ auth: {
    getUser: async () => ({ data: { user: { id: "session-user", email: "instructor@example.com" } }, error: null }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
  } });
  mocks.account.mockResolvedValue({ id: "session-user", email: "instructor@example.com", displayName: "Instructor", role: "instructor", status: "active" });
  mocks.course.mockResolvedValue({ id: courseId });
  mocks.client.mockReturnValue("service"); mocks.list.mockResolvedValue([]);
  mocks.save.mockResolvedValue({ ok: true, value: { id } });
});
describe("announcement library action boundary", () => {
  it("authenticates each endpoint before reading storage", async () => {
    mocks.cookie.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } });
    for (const action of actions) expect(await action()).toEqual({ ok: false, code: "unauthenticated" });
    expect(mocks.cookie).toHaveBeenCalledTimes(3); expect(mocks.course).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("executes the real guard and denies suspended accounts on every endpoint", async () => {
    mocks.account.mockResolvedValue({ id: "session-user", email: "instructor@example.com", role: "instructor", status: "suspended" });
    for (const action of actions) expect(await action()).toEqual({ ok: false, code: "unauthenticated" });
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.course).not.toHaveBeenCalled();
  });
  it("denies unknown or foreign courses on all endpoints", async () => {
    mocks.course.mockResolvedValue(null);
    for (const action of actions) expect(await action()).toEqual({ ok: false, code: "not-found" });
    expect(mocks.course).toHaveBeenCalledWith("session-user", courseId); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects malformed input before the ownership query", async () => {
    expect(await listAnnouncementLibraryAction("bad")).toEqual({ ok: false, code: "invalid" });
    expect(await saveAnnouncementLibraryEntryAction({ ...input, exemplarText: " " })).toEqual({ ok: false, code: "invalid" });
    expect(await deleteAnnouncementLibraryEntryAction(courseId, "bad")).toEqual({ ok: false, code: "invalid" });
    expect(mocks.course).not.toHaveBeenCalled();
  });
  it("uses only session identity and validated normalized data", async () => {
    await listAnnouncementLibraryAction(courseId); await saveAnnouncementLibraryEntryAction(input); await deleteAnnouncementLibraryEntryAction(courseId, id);
    expect(mocks.list).toHaveBeenCalledWith("service", "session-user", courseId);
    expect(mocks.save).toHaveBeenCalledWith("service", "session-user", { ...input, label: "Weekly" });
    expect(mocks.remove).toHaveBeenCalledWith("service", "session-user", courseId, id);
  });
  it("returns fixed categories without raw errors", async () => {
    mocks.list.mockRejectedValue(new Error("body label credential")); mocks.save.mockRejectedValue(new Error("secret")); mocks.remove.mockRejectedValue(new Error("secret"));
    for (const action of actions) expect(await action()).toEqual({ ok: false, code: "unavailable" });
    mocks.course.mockRejectedValue(new Error("secret"));
    expect(await actions[0]()).toEqual({ ok: false, code: "unavailable" });
  });
});
