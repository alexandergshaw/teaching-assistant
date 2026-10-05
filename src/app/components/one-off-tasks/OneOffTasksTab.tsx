"use client";

// One-Off Tasks tab (docs/one-off-tasks-scope.md, Wave 3). A container: it owns
// the hook and the institution registry, and hands the pieces to the composer,
// filter bar and rows. The database is reached only through the hook.
import { useMemo } from "react";
import { useInstitutions } from "@/lib/institutions";
import TabHeader from "../TabHeader";
import TaskComposer from "./TaskComposer";
import TaskFilterBar from "./TaskFilterBar";
import TaskRow from "./TaskRow";
import { groupTasksByCollege } from "./one-off-task-model";
import { useOneOffTasks } from "./useOneOffTasks";
import styles from "./OneOffTasks.module.css";

export default function OneOffTasksTab() {
  const institutions = useInstitutions();
  const {
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
  } = useOneOffTasks();

  const groups = useMemo(
    () => groupTasksByCollege(visibleTasks, institutions),
    [visibleTasks, institutions]
  );
  // With a college filter on, hide the other colleges' empty headers.
  const shownGroups =
    filter.college === undefined ? groups : groups.filter((g) => g.tasks.length > 0);

  return (
    <div className={styles.stack}>
      <TabHeader
        eyebrow="One-Off Tasks"
        title="One-Off Tasks"
        subtitle="Track one-time to-dos across your colleges."
      />
      <TaskComposer onAdd={add} />
      <TaskFilterBar
        institutions={institutions}
        filter={filter}
        onCollegeChange={setCollegeFilter}
        onStatusChange={setStatusFilter}
      />
      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className={styles.hint} role="status">
          Loading tasks...
        </p>
      ) : tasks.length === 0 ? (
        <p className={styles.hint}>No tasks yet. Add one above to get started.</p>
      ) : visibleTasks.length === 0 ? (
        <p className={styles.hint}>No tasks match the current filters.</p>
      ) : (
        shownGroups.map((group) => (
          <section key={group.college ?? "__unassigned__"} className={styles.group}>
            <h2 className={styles.groupTitle}>
              {group.college ?? "Unassigned"}
              <span className={styles.groupCount}>{group.tasks.length}</span>
            </h2>
            {group.tasks.length === 0 ? (
              <p className={styles.hintMuted}>Nothing here.</p>
            ) : (
              <ul className={styles.list}>
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    institutions={institutions}
                    onToggleDone={toggleDone}
                    onUpdate={update}
                    onRemove={remove}
                  />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
