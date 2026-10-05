// The repository seam: the only thing the hook reaches. Every call goes
// through the server actions - the component directory never imports
// src/lib/supabase directly (one-off-tasks-client-boundary.structure.test.ts).

import {
  addOneOffTaskAction,
  deleteOneOffTaskAction,
  listOneOffTasksAction,
  updateOneOffTaskAction,
} from "@/app/actions/one-off-tasks";
import type { NewTaskInput, OneOffTask, TaskPatch } from "./one-off-task-model";

export interface OneOffTasksRepository {
  list(): Promise<OneOffTask[]>;
  add(input: NewTaskInput): Promise<OneOffTask>;
  update(id: string, patch: TaskPatch): Promise<OneOffTask>;
  remove(id: string): Promise<void>;
}

export function createOneOffTasksRepository(): OneOffTasksRepository {
  return {
    async list() {
      const res = await listOneOffTasksAction();
      if ("error" in res) throw new Error(res.error);
      return res.tasks;
    },
    async add(input) {
      const res = await addOneOffTaskAction(input);
      if ("error" in res) throw new Error(res.error);
      return res.task;
    },
    async update(id, patch) {
      const res = await updateOneOffTaskAction(id, patch);
      if ("error" in res) throw new Error(res.error);
      return res.task;
    },
    async remove(id) {
      const res = await deleteOneOffTaskAction(id);
      if ("error" in res) throw new Error(res.error);
    },
  };
}
