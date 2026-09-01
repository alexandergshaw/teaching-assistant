"use client";

// AC9: add / rename / reorder / retire a task, for whichever sub-view is
// currently open. Every decision about WHAT the resolved catalog looks like
// is delegated to resolveTaskCatalog (course-tasks-view.ts) - this component
// only builds the TaskCatalogOverride rows that function reads, and shows
// the result back. Reordering assigns a fresh, explicit, sequential
// `position` to EVERY task in the affected group (not just the two that
// moved): amendment 121/122 make `position` a sort key compared against
// Infinity for "no override", and mixing one or two finite positions into a
// group where every other task still defaults to Infinity would silently
// reorder the whole group rather than just swapping two neighbors.
import { useId, useMemo, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import {
  type TaskCadence,
  type TaskDefinition,
  type TaskGroupId,
  type TaskView,
} from "@/lib/course-tasks";
import {
  baseTaskCatalogOverride,
  normalizeTaskLabel,
  resolveTaskCatalog,
  type TaskCatalogOverride,
} from "@/lib/course-tasks-view";
import { groupPositionAssignments, stepWithinGroup, type ReorderableColumn } from "./columnOrder";
// SHOULD 6 (Tasks-tab UX audit): Retire used to fire in ONE click, right
// beside Rename in a row of identically-sized small buttons, with no
// confirmation and no announcement - the column and every note/attachment/
// institution instruction reachable through it simply vanished from the
// grid. This is exactly the case this repo's shipped signature-based
// arming idiom exists for (isConfirmArmed: armed state is a property of
// WHAT it was armed for, not a timer) - already implemented correctly one
// file over for a smaller action (TaskAttachmentsDialog.tsx's Remove ->
// Confirm two-click flow, copied here almost verbatim).
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import styles from "./TasksGrid.module.css";

function generateCustomTaskId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `custom-${rand}`;
}

export interface ManageTasksDialogProps {
  open: boolean;
  onClose: () => void;
  view: TaskView;
  viewLabel: string;
  groups: { id: TaskGroupId; label: string }[];
  builtIns: TaskDefinition[];
  overrides: TaskCatalogOverride[];
  onSaveOverride: (override: TaskCatalogOverride) => Promise<{ ok: boolean; error?: string }>;
  /** AC2 item 8: the bulk write path a drag/keyboard/menu column reorder
   * also uses (TasksTab.tsx / useCourseTasksData.ts's saveDefs) - moveTask
   * below is migrated onto this so the dialog and the grid's reorder
   * affordances share ONE write path rather than two implementations that
   * could drift (moveTask's old version saved one row per task,
   * sequentially - 23 round trips for a single move on Independent, and not
   * atomic). */
  onSaveOverrides: (overrides: TaskCatalogOverride[]) => Promise<{ ok: boolean; error?: string }>;
}

export default function ManageTasksDialog({
  open,
  onClose,
  view,
  viewLabel,
  groups,
  builtIns,
  overrides,
  onSaveOverride,
  onSaveOverrides,
}: ManageTasksDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupLabelId = useId();
  const cadenceLabelId = useId();

  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState<TaskGroupId>(groups[0]?.id ?? "dependent");
  const [newCadence, setNewCadence] = useState<TaskCadence>("daily");

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // SHOULD 6: `confirmRetireId` is the armed-for taskId (or null) -
  // `isConfirmArmed` compares it against a ROW's own taskId, so arming one
  // row implicitly disarms whichever other row was armed before (there is
  // only ever one value here), exactly like TaskAttachmentsDialog's
  // `confirmRemoveId`.
  const [confirmRetireId, setConfirmRetireId] = useState<string | null>(null);
  const [retireStatus, setRetireStatus] = useState("");

  // Resets the transient form state whenever the dialog (re)opens - the
  // "adjusting state during rendering" pattern React's own docs recommend
  // for this exact case (https://react.dev/learn/you-might-not-need-an-effect
  // - "Adjusting some state when a prop changes"), rather than a useEffect
  // that calls setState synchronously (which this repo's lint config
  // forbids). `wasOpen` mirrors `open` from the PREVIOUS render only; the
  // reset itself only ever needs to happen once per open, so comparing
  // against last render's value (not the group list) is enough, and does
  // not blow away an in-progress rename/add if `groups` merely changes
  // identity without the dialog itself closing and reopening.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNewLabel("");
      setNewGroup(groups[0]?.id ?? "dependent");
      setNewCadence("daily");
      setRenamingId(null);
      setError(null);
      setConfirmRetireId(null);
      setRetireStatus("");
    }
  }

  const resolved = useMemo(() => resolveTaskCatalog(builtIns, overrides, view), [builtIns, overrides, view]);

  const retired = useMemo(() => {
    return overrides
      .filter((o) => o.retired)
      .filter((o) => {
        const builtIn = builtIns.find((t) => t.id === o.taskId);
        if (builtIn) return builtIn.view === view;
        return o.view === view;
      })
      .map((o) => {
        const builtIn = builtIns.find((t) => t.id === o.taskId);
        const label = o.label ?? builtIn?.label ?? "(untitled task)";
        const groupId = o.group ?? builtIn?.group ?? groups[0]?.id;
        const groupLabel = groups.find((g) => g.id === groupId)?.label ?? "";
        return { taskId: o.taskId, label, groupLabel };
      });
  }, [overrides, builtIns, view, groups]);

  const runSave = async (override: TaskCatalogOverride) => {
    setBusy(true);
    setError(null);
    const result = await onSaveOverride(override);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not save.");
    return result.ok;
  };

  const handleAdd = async () => {
    const label = normalizeTaskLabel(newLabel);
    if (!label) {
      setError("Enter a label for the new task.");
      return;
    }
    const taskId = generateCustomTaskId();
    const cadence: TaskCadence = view === "term" ? "once" : newCadence;
    const ok = await runSave({
      taskId,
      view,
      group: newGroup,
      label,
      cadence,
      position: null,
      retired: false,
      custom: true,
    });
    if (ok) setNewLabel("");
  };

  const startRename = (taskId: string, currentLabel: string) => {
    setRenamingId(taskId);
    setRenameDraft(currentLabel);
  };

  const commitRename = async (taskId: string) => {
    const label = normalizeTaskLabel(renameDraft);
    if (!label) {
      setError("A task's label cannot be blank.");
      return;
    }
    const base = baseTaskCatalogOverride(taskId, builtIns, overrides);
    const ok = await runSave({ ...base, label });
    if (ok) setRenamingId(null);
  };

  // SHOULD 6: the first click only arms (names the task it is armed for,
  // and announces it - Accessibility review fix 3's precedent from
  // TaskAttachmentsDialog.tsx, since the button's accessible name alone is
  // not useful to someone not already reading it); the SECOND click, while
  // still armed for the SAME task, actually retires it.
  const retireTask = async (taskId: string, label: string) => {
    if (!isConfirmArmed(confirmRetireId, taskId)) {
      setConfirmRetireId(taskId);
      setRetireStatus(`Press Confirm to retire "${label}".`);
      return;
    }
    setConfirmRetireId(null);
    const base = baseTaskCatalogOverride(taskId, builtIns, overrides);
    const ok = await runSave({ ...base, retired: true });
    if (ok) setRetireStatus(`Retired "${label}". Restore it under Retired below.`);
  };

  // Disarms on blur (silently - moving focus elsewhere is itself the
  // signal, nothing to announce) and on Escape (announced) - mirrors
  // TaskAttachmentsDialog.tsx's disarmRemove exactly.
  const disarmRetire = (taskId: string, label: string, announce: boolean) => {
    setConfirmRetireId((prev) => (prev === taskId ? null : prev));
    if (announce) setRetireStatus(`Retiring "${label}" cancelled.`);
  };

  const restoreTask = (taskId: string) => {
    const base = baseTaskCatalogOverride(taskId, builtIns, overrides);
    void runSave({ ...base, retired: false });
  };

  /** Moves `taskId` one slot toward `direction` within `groupId` and
   * reassigns explicit, sequential positions to EVERY task in that group in
   * ONE bulk write (AC2 items 6/8) - migrated off the old per-task
   * sequential save loop. Column visibility is not a concept this dialog
   * tracks, so every task in the group is passed through as "visible":
   * groupPositionAssignments numbers every one of them regardless, and the
   * grid's own hidden-task handling (TasksTab.tsx) is unaffected by that -
   * this only changes the reordering ALGORITHM's shared implementation, not
   * what gets persisted. */
  const moveTask = async (taskId: string, groupId: TaskGroupId, direction: "up" | "down") => {
    const groupTasks = resolved.filter((t) => t.group === groupId);
    const columns: ReorderableColumn[] = groupTasks.map((t) => ({ id: t.id, group: t.group, visible: true }));
    const moved = stepWithinGroup(columns, taskId, direction === "up" ? "left" : "right");
    if (!moved) return;

    const nextOverrides = groupPositionAssignments(moved, groupId).map((a) => ({
      ...baseTaskCatalogOverride(a.taskId, builtIns, overrides),
      position: a.position,
    }));

    setBusy(true);
    setError(null);
    const result = await onSaveOverrides(nextOverrides);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not reorder.");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage tasks - {viewLabel}</DialogTitle>
      <DialogContent>
        {/* S9: role="alert" - covers save failures and the blank-label
            rejection below, none of which were announced before. */}
        {error && (
          <p className={styles.inlineError} role="alert">
            {error}
          </p>
        )}

        {/* SHOULD 6: visible AND announced (role="status", the SAME node -
            matching TaskAttachmentsDialog.tsx's single-region idiom) -
            arming, cancelling, and the actual retire all report here. */}
        {retireStatus && (
          <p className={styles.inlineStatus} role="status">
            {retireStatus}
          </p>
        )}

        <div className={styles.dialogSection}>
          <strong style={{ fontSize: "var(--font-size-md)" }}>Add a task</strong>
          <div className={styles.dialogFormRow}>
            <TextField
              size="small"
              label="Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value.slice(0, 200))}
              sx={{ flex: "1 1 200px" }}
            />
            {/* B5: wrapped in FormControl + InputLabel with a matching
                labelId - previously a bare Select with no visible label at
                all (sighted users had to infer "this is the group" from
                position alone), so the fix improves both the accessible
                name and the on-screen affordance. */}
            <FormControl size="small">
              <InputLabel id={groupLabelId}>Group</InputLabel>
              <Select
                size="small"
                labelId={groupLabelId}
                label="Group"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value as TaskGroupId)}
              >
                {groups.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {view === "recurring" && (
              <FormControl size="small">
                <InputLabel id={cadenceLabelId}>Cadence</InputLabel>
                <Select
                  size="small"
                  labelId={cadenceLabelId}
                  label="Cadence"
                  value={newCadence}
                  onChange={(e) => setNewCadence(e.target.value as TaskCadence)}
                >
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                </Select>
              </FormControl>
            )}
            <Button variant="contained" size="small" disabled={busy} onClick={() => void handleAdd()}>
              Add
            </Button>
          </div>
        </div>

        {groups.map((group) => {
          const groupTasks = resolved.filter((t) => t.group === group.id);
          if (groupTasks.length === 0) return null;
          return (
            <div key={group.id} className={styles.dialogSection}>
              <div className={styles.groupHeading}>{group.label}</div>
              <div className={styles.columnList}>
                {groupTasks.map((task, i) => (
                  <div key={task.id} className={styles.taskRow}>
                    {renamingId === task.id ? (
                      <>
                        {/* S16: autoFocus lands here immediately, so an
                            explicit aria-label matters even more than usual
                            - without one, focus landed on an input
                            announced as nothing. */}
                        <TextField
                          size="small"
                          autoFocus
                          aria-label={`Rename "${task.label}"`}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value.slice(0, 200))}
                          sx={{ flex: 1 }}
                        />
                        <Button size="small" disabled={busy} onClick={() => void commitRename(task.id)}>
                          Save
                        </Button>
                        <Button size="small" disabled={busy} onClick={() => setRenamingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className={styles.taskRowLabel}>{task.label}</span>
                        {!task.builtIn && <span className={styles.taskRowMeta}>Custom</span>}
                        <IconButton
                          size="small"
                          aria-label={`Move ${task.label} up`}
                          disabled={busy || i === 0}
                          onClick={() => void moveTask(task.id, group.id, "up")}
                        >
                          {"↑"}
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={`Move ${task.label} down`}
                          disabled={busy || i === groupTasks.length - 1}
                          onClick={() => void moveTask(task.id, group.id, "down")}
                        >
                          {"↓"}
                        </IconButton>
                        <Button size="small" disabled={busy} onClick={() => startRename(task.id, task.label)}>
                          Rename
                        </Button>
                        {/* SHOULD 6: two literal branches (not one Button
                            with a ternary aria-label/color), matching
                            TaskAttachmentsDialog.tsx's own Remove/Confirm
                            pair - React reconciles them as updates to the
                            SAME underlying button (same type, same position),
                            so arming/disarming never remounts it or drops
                            focus. */}
                        {isConfirmArmed(confirmRetireId, task.id) ? (
                          <Button
                            size="small"
                            color="error"
                            disabled={busy}
                            aria-label={`Confirm retiring ${task.label}`}
                            onClick={() => void retireTask(task.id, task.label)}
                            onBlur={() => disarmRetire(task.id, task.label, false)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                disarmRetire(task.id, task.label, true);
                              }
                            }}
                          >
                            Confirm
                          </Button>
                        ) : (
                          <Button size="small" disabled={busy} onClick={() => void retireTask(task.id, task.label)}>
                            Retire
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {retired.length > 0 && (
          <div className={styles.dialogSection}>
            <div className={styles.groupHeading}>Retired</div>
            <div className={styles.columnList}>
              {retired.map((t) => (
                <div key={t.taskId} className={styles.taskRow}>
                  <span className={`${styles.taskRowLabel} ${styles.retiredLabel}`}>{t.label}</span>
                  <span className={styles.taskRowMeta}>{t.groupLabel}</span>
                  <Button size="small" disabled={busy} onClick={() => restoreTask(t.taskId)}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {busy && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", padding: "var(--space-2)" }} role="status" aria-live="polite">
            <CircularProgress size={18} />
            <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Saving…</span>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
