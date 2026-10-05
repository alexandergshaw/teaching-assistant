// The repository is driven through a mocked server-action module backed by an
// in-memory store. This proves WIRING and read-back through the production
// path; it does NOT prove durability, RLS, or cross-device persistence - those
// need a live database and are owner-only residuals.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NewTaskInput, OneOffTask, TaskPatch } from "./one-off-task-model";

const store: OneOffTask[] = [];

vi.mock("@/app/actions/one-off-tasks", () => ({
  listOneOffTasksAction: vi.fn(async () => ({ tasks: [...store] })),
  addOneOffTaskAction: vi.fn(async (input: NewTaskInput) => {
    const task: OneOffTask = {
      id: `id-${store.length + 1}`,
      title: input.title,
      college: input.college,
      done: false,
      notes: input.notes ?? "",
      dueDate: input.dueDate ?? null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    store.unshift(task);
    return { task };
  }),
  updateOneOffTaskAction: vi.fn(async (id: string, patch: TaskPatch) => {
    const idx = store.findIndex((t) => t.id === id);
    store[idx] = { ...store[idx], ...patch };
    return { task: store[idx] };
  }),
  deleteOneOffTaskAction: vi.fn(async (id: string) => {
    const idx = store.findIndex((t) => t.id === id);
    if (idx >= 0) store.splice(idx, 1);
    return { ok: true as const };
  }),
}));

import {
  listOneOffTasksAction,
  addOneOffTaskAction,
  updateOneOffTaskAction,
  deleteOneOffTaskAction,
} from "@/app/actions/one-off-tasks";
import { createOneOffTasksRepository } from "./oneOffTasksRepository";
import { groupTasksByCollege } from "./one-off-task-model";

beforeEach(() => {
  store.length = 0;
  vi.clearAllMocks();
});

describe("oneOffTasksRepository", () => {
  it("add delegates to the add action with the input", async () => {
    const input: NewTaskInput = { title: "Grade lab", college: "MCC" };
    await createOneOffTasksRepository().add(input);
    expect(addOneOffTaskAction).toHaveBeenCalledTimes(1);
    expect(addOneOffTaskAction).toHaveBeenCalledWith(input);
  });

  it("list, update and remove each delegate to their action", async () => {
    const repo = createOneOffTasksRepository();
    const added = await repo.add({ title: "A", college: null });
    await repo.list();
    expect(listOneOffTasksAction).toHaveBeenCalledTimes(1);
    await repo.update(added.id, { done: true });
    expect(updateOneOffTaskAction).toHaveBeenCalledWith(added.id, { done: true });
    await repo.remove(added.id);
    expect(deleteOneOffTaskAction).toHaveBeenCalledWith(added.id);
  });

  it("throws the action's error message", async () => {
    vi.mocked(addOneOffTaskAction).mockResolvedValueOnce({ error: "boom" });
    await expect(createOneOffTasksRepository().add({ title: "x", college: null })).rejects.toThrow("boom");
  });

  it("a task added earlier is listed by a fresh repository and grouped under its college", async () => {
    await createOneOffTasksRepository().add({ title: "Prior-load task", college: "MCC" });
    const listed = await createOneOffTasksRepository().list();
    expect(listed.map((t) => t.title)).toEqual(["Prior-load task"]);
    const groups = groupTasksByCollege(listed, ["MCC", "MPCC"]);
    expect(groups[0].college).toBe("MCC");
    expect(groups[0].tasks.map((t) => t.title)).toEqual(["Prior-load task"]);
  });
});
