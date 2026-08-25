"use client";

import { useState } from "react";
import type { WorkflowSchedule } from "@/lib/workflow-schedules";
import type { WorkflowTrigger } from "@/lib/workflow-triggers";
import type { WorkflowDef } from "@/lib/workflows/types";
import type { ScheduleFormData, TriggerFormData } from "@/lib/workflow-form-helpers";
import {
  buildAutomationRows,
  sortAutomationRows,
  parseAutomationSortState,
  DEFAULT_AUTOMATION_SORT,
  type AutomationSortField,
  type AutomationSortState,
} from "@/lib/automations-table-helpers";
import { needsAttention } from "./automation-inventory-logic";
import { ScheduleRow, TriggerRow } from "./AutomationRow";
import { CronHeartbeatStatus } from "./CronHeartbeatStatus";
import { ScheduledReleasesPanel } from "./ScheduledReleasesPanel";
import styles from "../../page.module.css";
import tableStyles from "./AutomationsTable.module.css";

// The Automations hub: every schedule and trigger, grouped into Scheduled
// and Triggered (AC2) - they answer different questions ("what runs on a
// clock" versus "what reacts to an event"), so a mixed list would make
// neither legible, and grouping is the primary structure a sort can never
// cross. Both groups share one sort control (clicking a header in either
// table updates the same persisted state and re-sorts both), but each
// group is sorted independently - see sortAutomationRows.

const SORT_KEY = "ta-automations-sort";

type HubCourse = { id: string; name: string; canvasUrl: string | null; repos: string[] };

interface AutomationsPanelProps {
  workflows: WorkflowDef[];
  schedules: WorkflowSchedule[] | null;
  triggers: WorkflowTrigger[] | null;
  onSelectWorkflow: (workflowId: string, panel: "automate") => void;
  onToggleSchedule: (schedule: WorkflowSchedule) => Promise<void>;
  onToggleTrigger: (trigger: WorkflowTrigger) => Promise<void>;
  hubCourses: HubCourse[] | null;
  institutions: string[];
  activeInstitution: string | null;
  orgs: string[] | null;
  orgsError: string | null;
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  expanded: Set<string>;
  onToggleExpanded: (key: string) => void;
  editingKey: string | null;
  scheduleEditForm: ScheduleFormData | null;
  setScheduleEditForm: (form: ScheduleFormData | null | ((prev: ScheduleFormData | null) => ScheduleFormData | null)) => void;
  triggerEditForm: TriggerFormData | null;
  setTriggerEditForm: (form: TriggerFormData | null | ((prev: TriggerFormData | null) => TriggerFormData | null)) => void;
  editBusy: boolean;
  editError: string | null;
  onStartEditSchedule: (schedule: WorkflowSchedule) => void;
  onStartEditTrigger: (trigger: WorkflowTrigger) => void;
  onSaveScheduleEdit: (scheduleId: string) => void;
  onSaveTriggerEdit: (triggerId: string) => void;
  onCancelEdit: () => void;
}

// "Last run" used to be one combined status+timestamp column; it is now two
// independently sortable columns - "Status" (lastRunStatus) and "Last run"
// (lastRunAt, timestamp only) - see automations-table-helpers.ts.
const COLUMN_LABELS: Record<AutomationSortField, string> = {
  name: "Name",
  fires: "Fires",
  lastRunStatus: "Status",
  lastRunAt: "Last run",
  nextRun: "Next run",
  enabled: "Enabled",
  unattended: "Unattended",
};

const COLUMN_ORDER: AutomationSortField[] = ["name", "fires", "lastRunStatus", "lastRunAt", "nextRun", "enabled", "unattended"];

export function AutomationsPanel({
  workflows,
  schedules,
  triggers,
  onSelectWorkflow,
  onToggleSchedule,
  onToggleTrigger,
  hubCourses,
  institutions,
  activeInstitution,
  orgs,
  orgsError,
  isWorkflowHeadlessSafeById,
  expanded,
  onToggleExpanded,
  editingKey,
  scheduleEditForm,
  setScheduleEditForm,
  triggerEditForm,
  setTriggerEditForm,
  editBusy,
  editError,
  onStartEditSchedule,
  onStartEditTrigger,
  onSaveScheduleEdit,
  onSaveTriggerEdit,
  onCancelEdit,
}: AutomationsPanelProps) {
  // Lazy-initialized from localStorage, client-only guard avoids an SSR
  // mismatch - mirrors CoursesTable's ta-courses-sort idiom (AC4). An
  // unrecognized or corrupt stored value falls back to the default sort
  // (parseAutomationSortState never throws).
  const [sort, setSort] = useState<AutomationSortState>(() =>
    typeof window === "undefined" ? DEFAULT_AUTOMATION_SORT : parseAutomationSortState(localStorage.getItem(SORT_KEY))
  );

  const applySort = (field: AutomationSortField) => {
    setSort((prev) => {
      const next: AutomationSortState = prev.field === field ? { field, direction: prev.direction === "asc" ? "desc" : "asc" } : { field, direction: "asc" };
      localStorage.setItem(SORT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const { scheduled, triggered } = buildAutomationRows(workflows, schedules, triggers);
  const sortedScheduled = sortAutomationRows(scheduled, sort);
  const sortedTriggered = sortAutomationRows(triggered, sort);

  // AC6: the "nothing at all" empty state is distinct from a loading
  // failure (which AutomationsTabView handles before this panel ever
  // mounts) and from either group being individually empty (handled per
  // group below).
  if (schedules !== null && triggers !== null && scheduled.length === 0 && triggered.length === 0) {
    return (
      <div>
        {/* The scheduler's own status belongs here too (H3 item 13): "is the
            runner alive at all" is a fact about the deployment, not about
            whether this instructor has scheduled anything yet - an empty
            list and a dead cron are unrelated problems. */}
        <CronHeartbeatStatus />
        <p className={styles.fieldHint}>No workflows are scheduled or have triggers yet.</p>
        <p className={styles.fieldHint} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Open a workflow in the Workflows tab and use the Automate panel to add schedules or triggers.
        </p>
        {/* F11.4: scheduled releases are an independent concern from
            workflow schedules/triggers - a course with zero of the latter
            can still have releases pending from the Modules view, so this
            mounts here too rather than only in the populated branch below. */}
        <ScheduledReleasesPanel />
      </div>
    );
  }

  const anyNeedsAttention =
    (schedules ?? []).some((s) => needsAttention(s, null)) || (triggers ?? []).some((t) => needsAttention(null, t));

  const sortIndicator = (field: AutomationSortField) => (sort.field === field ? (sort.direction === "asc" ? " ▲" : " ▼") : "");
  const ariaSortFor = (field: AutomationSortField): "ascending" | "descending" | "none" =>
    sort.field === field ? (sort.direction === "asc" ? "ascending" : "descending") : "none";

  const renderHead = () => (
    <thead>
      <tr>
        {COLUMN_ORDER.map((field) => (
          <th
            key={field}
            scope="col"
            aria-sort={ariaSortFor(field)}
            className={tableStyles.sortableHeader}
            onClick={() => applySort(field)}
          >
            {COLUMN_LABELS[field]}
            {sortIndicator(field)}
          </th>
        ))}
        <th scope="col">Actions</th>
      </tr>
    </thead>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* The scheduler's own status, above both groups (H3 item 13) - this
          is the view that already answers "what is set to run
          automatically", so "is the runner alive at all" belongs at its
          top, ahead of the per-row "Needs attention" summary below (which is
          about individual schedules/triggers, not the cron process itself). */}
      <CronHeartbeatStatus />

      {/* F11.4: the Automations hub is where a release, once committed from
          the Modules view, is seen and cancelled - see
          ScheduledReleasesPanel.tsx's own header for why every decision it
          renders lives in scheduledReleasesPanelLogic.ts instead. */}
      <ScheduledReleasesPanel />

      {anyNeedsAttention && (
        <div>
          <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`} style={{ display: "inline-block" }}>
            Needs attention
          </span>
        </div>
      )}

      <section>
        <h3 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Scheduled ({scheduled.length})</h3>
        {scheduled.length === 0 ? (
          <p className={styles.fieldHint}>No workflows are scheduled yet.</p>
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              {renderHead()}
              <tbody>
                {sortedScheduled.map((row) => (
                  <ScheduleRow
                    key={row.key}
                    schedule={row.schedule as WorkflowSchedule}
                    schedules={schedules}
                    workflows={workflows}
                    onSelectWorkflow={onSelectWorkflow}
                    hubCourses={hubCourses}
                    institutions={institutions}
                    isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
                    expanded={expanded.has(row.key)}
                    onToggleExpanded={() => onToggleExpanded(row.key)}
                    isEditing={editingKey === row.key}
                    editForm={scheduleEditForm}
                    setEditForm={setScheduleEditForm}
                    editBusy={editBusy}
                    editError={editError}
                    onStartEdit={() => onStartEditSchedule(row.schedule as WorkflowSchedule)}
                    onSaveEdit={onSaveScheduleEdit}
                    onCancelEdit={onCancelEdit}
                    onToggle={onToggleSchedule}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Triggered ({triggered.length})</h3>
        {triggered.length === 0 ? (
          <p className={styles.fieldHint}>No triggered workflows yet.</p>
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              {renderHead()}
              <tbody>
                {sortedTriggered.map((row) => (
                  <TriggerRow
                    key={row.key}
                    trigger={row.trigger as WorkflowTrigger}
                    triggers={triggers}
                    workflows={workflows}
                    onSelectWorkflow={onSelectWorkflow}
                    hubCourses={hubCourses}
                    institutions={institutions}
                    activeInstitution={activeInstitution}
                    isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
                    orgs={orgs}
                    orgsError={orgsError}
                    expanded={expanded.has(row.key)}
                    onToggleExpanded={() => onToggleExpanded(row.key)}
                    isEditing={editingKey === row.key}
                    editForm={triggerEditForm}
                    setEditForm={setTriggerEditForm}
                    editBusy={editBusy}
                    editError={editError}
                    onStartEdit={() => onStartEditTrigger(row.trigger as WorkflowTrigger)}
                    onSaveEdit={onSaveTriggerEdit}
                    onCancelEdit={onCancelEdit}
                    onToggle={onToggleTrigger}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
