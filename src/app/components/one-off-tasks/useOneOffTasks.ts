"use client";

// The hook seam the One-Off Tasks tab reaches (wired in W3). Owns the task
// list, optimistic add/toggle/remove with rollback, and the persisted filter
// controls. Talks only to the repository, never to the database directly.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createOneOffTasksRepository } from "./oneOffTasksRepository";
import {
  filterTasks,
  type NewTaskInput,
  type OneOffTask,
  type TaskFilter,
  type TaskPatch,
} from "./one-off-task-model";

const COLLEGE_FILTER_KEY = "ta-one-off-college-filter";
const STATUS_FILTER_KEY = "ta-one-off-status-filter";
const ALL_COLLEGES = "__all__";
const UNASSIGNED = "__unassigned__";

type StatusFilter = "all" | "open" | "done";

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the control still works for this session.
  }
}

export function useOneOffTasks() {
  const repository = useMemo(() => createOneOffTasksRepository(), []);
  const [tasks, setTasks] = useState<OneOffTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collegeFilter, setCollegeFilterState] = useState<string>(ALL_COLLEGES);
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>("all");

  // Restore persisted controls after mount (a localStorage-seeded initializer
  // would mismatch the server render).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const savedCollege = readKey(COLLEGE_FILTER_KEY);
      if (savedCollege) setCollegeFilterState(savedCollege);
      const savedStatus = readKey(STATUS_FILTER_KEY);
      if (savedStatus === "open" || savedStatus === "done" || savedStatus === "all") {
        setStatusFilterState(savedStatus);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await repository.list();
        if (cancelled) return;
        setTasks(loaded);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const add = useCallback(
    async (input: NewTaskInput): Promise<boolean> => {
      try {
        const created = await repository.add(input);
        setTasks((prev) => [created, ...prev]);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add task.");
        return false;
      }
    },
    [repository]
  );

  const update = useCallback(
    async (id: string, patch: TaskPatch): Promise<boolean> => {
      let previous: OneOffTask | undefined;
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          previous = t;
          return { ...t, ...patch };
        })
      );
      try {
        const saved = await repository.update(id, patch);
        setTasks((prev) => prev.map((t) => (t.id === id ? saved : t)));
        setError(null);
        return true;
      } catch (err) {
        const rollback = previous;
        if (rollback) setTasks((prev) => prev.map((t) => (t.id === id ? rollback : t)));
        setError(err instanceof Error ? err.message : "Failed to update task.");
        return false;
      }
    },
    [repository]
  );

  const toggleDone = useCallback(
    (id: string, done: boolean) => update(id, { done }),
    [update]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      let removed: OneOffTask | undefined;
      setTasks((prev) => {
        removed = prev.find((t) => t.id === id);
        return prev.filter((t) => t.id !== id);
      });
      try {
        await repository.remove(id);
        setError(null);
        return true;
      } catch (err) {
        const restore = removed;
        if (restore) setTasks((prev) => [restore, ...prev]);
        setError(err instanceof Error ? err.message : "Failed to delete task.");
        return false;
      }
    },
    [repository]
  );

  const setCollegeFilter = useCallback((value: string | null | "all") => {
    const stored = value === "all" ? ALL_COLLEGES : value === null ? UNASSIGNED : value;
    setCollegeFilterState(stored);
    writeKey(COLLEGE_FILTER_KEY, stored);
  }, []);

  const setStatusFilter = useCallback((value: StatusFilter) => {
    setStatusFilterState(value);
    writeKey(STATUS_FILTER_KEY, value);
  }, []);

  const filter: TaskFilter = useMemo(
    () => ({
      college:
        collegeFilter === ALL_COLLEGES
          ? undefined
          : collegeFilter === UNASSIGNED
            ? null
            : collegeFilter,
      status: statusFilter,
    }),
    [collegeFilter, statusFilter]
  );

  const visibleTasks = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);

  return {
    tasks,
    visibleTasks,
    loading,
    error,
    filter,
    add,
    update,
    toggleDone,
    remove,
    setCollegeFilter,
    setStatusFilter,
  };
}
