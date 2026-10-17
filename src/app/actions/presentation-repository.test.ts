import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async original => ({ ...await original<typeof import("@/lib/supabase/app-users")>(), getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() }));
vi.mock("@/lib/presentations/repository-template-source", () => ({ loadRepositoryTemplate: vi.fn() }));
vi.mock("@/lib/presentations/repository-publish", () => ({ publisherLogin: vi.fn(), publishSnapshot: vi.fn() }));
vi.mock("@/lib/presentations/copilot-tasks", () => ({ copilotTasksEnabled: vi.fn(() => false), startPresentationCopilotTask: vi.fn(), getPresentationCopilotTaskStatus: vi.fn(), describeCopilotTaskError: vi.fn(() => "task error") }));
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/supabase/app-users";
import { publisherLogin, publishSnapshot } from "@/lib/presentations/repository-publish";
import { getPresentationCopilotTaskStatus, startPresentationCopilotTask } from "@/lib/presentations/copilot-tasks";
import { loadRepositoryTemplate } from "@/lib/presentations/repository-template-source";
import { originalFixture, templateInput } from "@/lib/presentations/repository-template-fixture";
import { getPresentationPublisherAction, reviewPresentationRepositoryAction, publishPresentationRepositoryAction, refreshPresentationCopilotTaskAction, startPresentationCopilotTaskAction } from "./presentation-repository";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(publisherLogin).mockResolvedValue("owner");
  vi.mocked(loadRepositoryTemplate).mockResolvedValue(undefined);
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "owner@example.test" } }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) } } } as never);
  vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "instructor", status: "active" } as never);
});
describe("owner-private snapshot actions", () => {
  it("runs the real owner guard before rendering or GitHub egress", async () => {
    expect(await getPresentationPublisherAction()).toHaveProperty("error");
    expect(await publishPresentationRepositoryAction(null, "deck", "owner")).toHaveProperty("error");
    expect(await reviewPresentationRepositoryAction(templateInput)).toHaveProperty("error");
    expect(loadRepositoryTemplate).not.toHaveBeenCalled();
    expect(await startPresentationCopilotTaskAction({})).toHaveProperty("error");
    expect(await refreshPresentationCopilotTaskAction({})).toHaveProperty("error");
    expect(publisherLogin).not.toHaveBeenCalled();
    expect(publishSnapshot).not.toHaveBeenCalled();
    expect(startPresentationCopilotTask).not.toHaveBeenCalled();
    expect(getPresentationCopilotTaskStatus).not.toHaveBeenCalled();
  });
  it("allows owner account review and validates inputs before publication", async () => {
    vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "owner", status: "active" } as never);
    vi.mocked(publisherLogin).mockResolvedValue("owner");
    expect(await getPresentationPublisherAction()).toEqual({ login: "owner", copilotTasksEnabled: false });
    expect(await publishPresentationRepositoryAction({ templateSelected: true }, "deck", "owner")).toHaveProperty("error");
    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  it("forwards a task only after the owner guard and exact request validation", async () => {
    vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "owner", status: "active" } as never);
    vi.mocked(startPresentationCopilotTask).mockResolvedValue({ id: "task-id", url: "https://github.com/owner/deck/copilot/tasks/task-id", state: "queued", baseCommit: "a".repeat(40) });
    const request = { owner: "owner", repo: "deck", snapshotId: "b".repeat(64), snapshotCommit: "a".repeat(40), prompt: "Make a course website", kind: "initial" };
    expect(await startPresentationCopilotTaskAction(request)).toMatchObject({ task: { id: "task-id" } });
    expect(startPresentationCopilotTask).toHaveBeenCalledWith("u1", "owner", request);
    expect(await startPresentationCopilotTaskAction({ ...request, kind: "automatically" })).toHaveProperty("error");
    expect(startPresentationCopilotTask).toHaveBeenCalledTimes(1);
  });
  it("forwards continuation IDs and authenticates the current GitHub account", async () => {
    vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "owner", status: "active" } as never);
    vi.mocked(publisherLogin).mockResolvedValue("actual-account");
    const request = { owner: "owner", repo: "deck", snapshotId: "b".repeat(64), snapshotCommit: "a".repeat(40), prompt: "Refine the output", kind: "followup", previousTaskId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
    await startPresentationCopilotTaskAction(request);
    expect(startPresentationCopilotTask).toHaveBeenCalledWith("u1", "actual-account", request);
    expect(await startPresentationCopilotTaskAction({ ...request, previousTaskId: 123 })).toHaveProperty("error");
    expect(startPresentationCopilotTask).toHaveBeenCalledTimes(1);
  });
  it("refreshes task status only through the owner guard and signed snapshot helper", async () => {
    vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "owner", status: "active" } as never);
    const request = { owner: "owner", repo: "deck", snapshotId: "b".repeat(64), snapshotCommit: "a".repeat(40), taskId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
    vi.mocked(getPresentationCopilotTaskStatus).mockResolvedValue({ id: request.taskId, url: `https://github.com/owner/deck/tasks/${request.taskId}`, state: "completed", baseCommit: request.snapshotCommit });
    expect(await refreshPresentationCopilotTaskAction(request)).toMatchObject({ task: { state: "completed" } });
    expect(getPresentationCopilotTaskStatus).toHaveBeenCalledWith("u1", "owner", request);
    expect(await refreshPresentationCopilotTaskAction({ ...request, taskId: 123 })).toHaveProperty("error");
    expect(getPresentationCopilotTaskStatus).toHaveBeenCalledTimes(1);
    expect(startPresentationCopilotTask).not.toHaveBeenCalled();
  });
  it("binds review to original bytes and refuses external template change before GitHub egress", async () => {
    vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "owner", status: "active" } as never);
    vi.mocked(publisherLogin).mockResolvedValue("owner");
    vi.mocked(loadRepositoryTemplate).mockResolvedValue(await originalFixture());
    const reviewed = await reviewPresentationRepositoryAction(templateInput);
    expect(reviewed).toHaveProperty("templateDigest");
    if ("error" in reviewed) throw new Error(reviewed.error);
    expect(loadRepositoryTemplate).toHaveBeenCalledWith("u1", templateInput.templateChoice);
    expect(await publishPresentationRepositoryAction(templateInput, "deck", "owner")).toHaveProperty("error");
    expect(publishSnapshot).not.toHaveBeenCalled();
    vi.mocked(publishSnapshot).mockResolvedValue({ status: "ready", phase: "ready", snapshot: reviewed.snapshotId, repoUrl: "https://github.com/owner/deck" });
    expect(await publishPresentationRepositoryAction(templateInput, "deck", "owner", reviewed.snapshotId)).toHaveProperty("receipt");
    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    vi.mocked(publishSnapshot).mockClear();
    vi.mocked(loadRepositoryTemplate).mockResolvedValue(await originalFixture("changed externally"));
    expect(await publishPresentationRepositoryAction(templateInput, "deck", "owner", reviewed.snapshotId)).toMatchObject({ error: expect.stringContaining("changed") });
    expect(publishSnapshot).not.toHaveBeenCalled();
    vi.mocked(loadRepositoryTemplate).mockRejectedValue(new Error("foreign template"));
    expect(await reviewPresentationRepositoryAction(templateInput)).toHaveProperty("error");
    expect(await publishPresentationRepositoryAction(templateInput, "deck", "owner", reviewed.snapshotId)).toHaveProperty("error");
    expect(publishSnapshot).not.toHaveBeenCalled();
  });

});
