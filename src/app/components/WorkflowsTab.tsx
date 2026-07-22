"use client";

import { useCallback, useEffect, useMemo, useState, useRef, Fragment } from "react";
import { Button, TextField, Tabs, Tab } from "@mui/material";
import TabHeader from "./TabHeader";
import WorkflowBuilder from "./WorkflowBuilder";
import WorkflowScopeControl from "./WorkflowScopeControl";
import { AutomateOverview } from "./workflows/AutomateOverview";
import { ScheduleSection } from "./workflows/ScheduleSection";
import { TriggerSection } from "./workflows/TriggerSection";
import { RuntimeFieldInput } from "./workflows/RuntimeFieldInput";
import { RunStepCard } from "./workflows/RunStepCard";
import { StepOverviewRow } from "./workflows/StepOverviewRow";
import { RunInputPrompt } from "./workflows/RunInputPrompt";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutionSelection } from "@/lib/institutions";
import { getStoredProvider } from "@/lib/llm-provider";
import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile, listRecordingFiles, downloadRecordingFile, extForFile } from "@/lib/recording-files";
import { uploadCourseZip, uploadCourseZipChunked, removeCourseZip, removeCourseZipObjects, downloadCourseZipBlob } from "@/lib/course-files";
import { parseCartridgeBlob, type CartridgeCourseData } from "@/lib/cartridge-import";
import { liveModuleValue, exportModuleValue } from "@/lib/workflows/module-value";
import {
  listWorkflowSchedules,
  createWorkflowSchedule,
  updateWorkflowSchedule,
  deleteWorkflowSchedule,
  reenableSchedule,
  MIN_INTERVAL_MINUTES,
  type WorkflowSchedule,
  type ScheduleRepeat,
} from "@/lib/workflow-schedules";
import { peekScheduledRun, takeScheduledRun, SCHEDULED_RUN_EVENT } from "@/lib/workflow-schedule-handoff";
import {
  listWorkflowTriggers,
  createWorkflowTrigger,
  updateWorkflowTrigger,
  deleteWorkflowTrigger,
  generateWebhookToken,
  getEventSource,
  type WorkflowTrigger,
  type TriggerEventType,
} from "@/lib/workflow-triggers";
import { recordWorkflowRun } from "@/lib/workflow-runs";
import { isScopeableListType, expandScopedValue, resolveClassRepoRef, resolveClassTileRef } from "@/lib/workflows/scope";
import { isInstitutionFanout, resolveFanoutInstitutions, scopeForInstitution } from "@/lib/workflows/fanout";
import { loadCommonResources } from "@/lib/common-resources";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { listCourseHubAction, appendCourseMaterialFileAction, appendCourseExportFileAction, listMyOrgsAction, listCoursesAction, listCourseContentAction, registerOrgPushWebhookAction, listDeckTemplatesAction } from "@/app/actions";
import type { CodeRunResult } from "@/lib/code-runner";
import type { CanvasModule } from "@/lib/canvas-modules";
import {
  loadCustomWorkflows,
  collectRuntimeFields,
  saveCustomWorkflows,
  expandWorkflowDef,
  loadDisabledSteps,
  saveDisabledSteps,
  applyWorkflowScope,
  scopeCoversType,
  describeWorkflowScope,
  type WorkflowScope,
} from "@/lib/workflows/types";
import { splitDetailSections } from "@/lib/workflows/detail-sections";
import {
  listWorkflowDefs,
  upsertWorkflowDef,
  deleteWorkflowDef,
} from "@/lib/workflow-defs";
import {
  allWorkflows,
  COURSE_KICKOFF,
} from "@/lib/workflows/presets";
import { DECK_PRESETS } from "@/lib/decks/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import {
  getStepDefinition,
  type StepRunSummary,
  type StepRunHelpers,
  type TableRowDetail,
} from "@/lib/workflows/registry";
import type { WorkflowDef, RuntimeField, WorkflowStepConfig } from "@/lib/workflows/types";
import styles from "../page.module.css";

// Summary renderer for a finished step. A separate component so `summary` is a
// const parameter: the `summary.kind` narrowing then persists into the CSV
// button closures, which TypeScript does not allow on state property chains.
function SummaryView({ summary }: { summary: StepRunSummary }) {
  if (summary.kind === "schedule") {
    return (
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Week
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Topic
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Summary
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Assignment
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Test
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.schedule.map((week) => (
              <tr key={week.week}>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.week}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.topic}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.summary}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.assignmentTitle}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.testName}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              const blob = new Blob([summary.csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const sanitized =
                summary.courseTitle.replace(/\s+/g, "-").toLowerCase() ||
                "schedule";
              a.download = `${sanitized}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              navigator.clipboard.writeText(summary.csv).catch(() => {});
            }}
          >
            Copy CSV
          </Button>
        </div>
      </div>
    );
  }

  if (summary.kind === "link") {
    return (
      <a
        className={styles.linkButton}
        href={summary.url}
        target="_blank"
        rel="noreferrer"
      >
        {summary.label}
      </a>
    );
  }

  if (summary.kind === "list") {
    return (
      <>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{summary.label}</p>
        <ul className={styles.fieldHint} style={{ margin: "4px 0 0 16px" }}>
          {summary.items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </>
    );
  }

  return <p className={styles.fieldHint}>{summary.text}</p>;
}

// Numeric-aware comparison for review-table sorting: numbers sort numerically
// and before non-numbers; everything else sorts lexicographically.
function compareTableValues(a: string, b: string): number {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  const aNum = a.trim() !== "" && Number.isFinite(na);
  const bNum = b.trim() !== "" && Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Validity of a review-table grade cell (tables with grade/outOf columns):
// null when fine, else a short problem description. An EMPTY grade is valid -
// post-grades deliberately supports comment-only posting with no score.
function tableGradeIssue(row: Record<string, string>): string | null {
  const raw = (row.grade ?? "").trim();
  if (raw === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return "not a number";
  const grade = parseFloat(raw);
  const outOf = parseFloat((row.outOf ?? "").trim());
  if (grade < 0) return "below 0";
  if (Number.isFinite(outOf) && grade > outOf) return `above ${outOf}`;
  return null;
}

type GradeBand = "success" | "accent" | "warning" | "danger" | "neutral";

// Visual banding for the Grade badge/distribution bar: percentage bands when
// grade/outOf are both usable numbers, else a neutral "unbanded" pill (empty,
// invalid, or no outOf to compute a percentage against).
function tableGradeBand(row: Record<string, string>): { band: GradeBand; pct: number | null } {
  const raw = (row.grade ?? "").trim();
  if (raw === "" || tableGradeIssue(row) !== null) return { band: "neutral", pct: null };
  const outOf = parseFloat((row.outOf ?? "").trim());
  if (!Number.isFinite(outOf) || outOf <= 0) return { band: "neutral", pct: null };
  const pct = (parseFloat(raw) / outOf) * 100;
  const band: GradeBand =
    pct >= 90 ? "success" : pct >= 80 ? "accent" : pct >= 70 ? "warning" : "danger";
  return { band, pct };
}

const GRADE_BAND_BADGE_CLASS: Record<GradeBand, string> = {
  success: styles.ghBadgeSuccess,
  accent: styles.ghBadgeAccent,
  warning: styles.ghBadgeWarning,
  danger: styles.ghBadgeDanger,
  neutral: styles.ghBadgeNeutral,
};

// Compact read-out beside the editable Grade cell - a visual summary only,
// the TextField above it stays the actual (and only) way to edit the value.
function GradeBadge({ row }: { row: Record<string, string> }) {
  const raw = (row.grade ?? "").trim();
  if (raw === "") {
    return (
      <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>No grade</span>
    );
  }
  const { band, pct } = tableGradeBand(row);
  const label = pct !== null ? `${Math.round(pct)}%` : raw;
  return (
    <span className={`${styles.ghBadge} ${GRADE_BAND_BADGE_CLASS[band]}`}>{label}</span>
  );
}

// Presentation for a row-detail text blob: headed sections when the
// registry's rowDetail text has recognizable section labels ("Rubric
// breakdown:", "AI feedback:", ...), otherwise the original single
// pre-wrap block untouched (no headers to show, so no dividers either).
function DetailSectionsView({ text }: { text: string }) {
  const sections = splitDetailSections(text);
  const hasHeaders = sections.some((s) => s.header !== null);
  if (!hasHeaders) {
    return <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>;
  }
  return (
    <>
      {sections.map((section, idx) => (
        <div key={idx} className={idx > 0 ? styles.workflowDetailSectionDivider : undefined}>
          {section.header && (
            <div className={styles.workflowDetailSectionHeader}>{section.header}</div>
          )}
          {section.body && <div style={{ whiteSpace: "pre-wrap" }}>{section.body}</div>}
        </div>
      ))}
    </>
  );
}

export default function WorkflowsTab() {
  const { supabase, user } = useSupabase();
  const { institutions, active: activeInstitution } = useInstitutionSelection();

  const pendingDefRef = useRef<WorkflowDef | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [custom, setCustom] = useState<WorkflowDef[]>(() =>
    typeof window === "undefined" ? [] : loadCustomWorkflows()
  );
  // Signed in, custom defs live in Supabase and arrive async; scheduled runs
  // of custom workflows must not be judged "missing" before they land. A
  // failed load is tracked separately so those runs are skipped with an error
  // instead of stalling the queue or wrongly disabling their schedules.
  const [customLoaded, setCustomLoaded] = useState(false);
  const [customLoadFailed, setCustomLoadFailed] = useState(false);
  const workflows = allWorkflows(custom);
  const [workflowSearch, setWorkflowSearch] = useState<string>(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("ta-workflows-search") ?? ""
  );
  useEffect(() => {
    try {
      localStorage.setItem("ta-workflows-search", workflowSearch);
    } catch {
      // ignore storage write failures
    }
  }, [workflowSearch]);
  const workflowQuery = workflowSearch.trim().toLowerCase();
  const filteredWorkflows = workflowQuery
    ? workflows.filter(
        (w) =>
          w.name.toLowerCase().includes(workflowQuery) ||
          (w.description ?? "").toLowerCase().includes(workflowQuery)
      )
    : workflows;

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    if (typeof window === "undefined") return COURSE_KICKOFF.id;
    const saved = localStorage.getItem("ta-workflows-selected");
    if (saved && workflows.some((w) => w.id === saved)) return saved;
    return workflows[0]?.id ?? COURSE_KICKOFF.id;
  });

  const selectedDef = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0];

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined" || !selectedDef) return {};
    const saved = localStorage.getItem(`ta-workflow-values-${selectedDef.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  });

  // Per-user overlay of disabled TOP-LEVEL step indices for the selected
  // workflow (see expandWorkflowDef's topIndices). Persisted per workflow id;
  // never mutates the workflow def itself. Loaded/saved the same way as
  // `values` above.
  const [disabledSteps, setDisabledSteps] = useState<Set<number>>(() =>
    selectedDef ? new Set(loadDisabledSteps(selectedDef.id)) : new Set()
  );

  type StepState = {
    status: "pending" | "running" | "done" | "error" | "disabled" | "skipped";
    progress: string | null;
    summary: StepRunSummary | null;
    error: string | null;
  };
  const [runState, setRunState] = useState<
    Array<{ institution: string | null; steps: StepState[] }>
  >([]);

  const [running, setRunning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [runPause, setRunPause] = useState<{ groupIndex: number; stepIndex: number; message: string } | null>(null);
  const pauseResolverRef = useRef<{ resolve: (go: boolean) => void } | null>(null);

  const [runInput, setRunInput] = useState<{
    groupIndex: number;
    stepIndex: number;
    message: string;
    kind: "text" | "choice" | "upload" | "workflow" | "table";
    options: Array<{ value: string; label: string }>;
    optional: boolean;
    initialValue?: string;
    submitLabel?: string;
    regenerate?: () => Promise<string>;
    columns?: Array<{ key: string; label: string; editable?: boolean; multiline?: boolean; link?: boolean; width?: number }>;
    selectable?: boolean;
    rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
    transform?: (value: string | File[] | Array<Record<string, string>>) => unknown;
  } | null>(null);
  const inputResolverRef = useRef<{ resolve: (value: string | File[] | Array<Record<string, string>> | null) => void } | null>(null);
  const [, setRunInputText] = useState("");
  const [, setRunInputChoice] = useState("");
  const [, setRunInputFiles] = useState<File[]>([]);
  const [runInputRows, setRunInputRows] = useState<Array<Record<string, string>>>([]);
  const [, setRunInputChecked] = useState<boolean[]>([]);
  const [, setRunInputBusy] = useState(false);
  const [, setRunInputError] = useState<string | null>(null);
  const [, setRunInputDetails] = useState<Record<number, { open: boolean; status: "loading" | "done" | "error"; detail: TableRowDetail | null; error: string; run?: { status: "running" | "done"; result: CodeRunResult | null; error?: string } }>>({});
  // Review-table QoL state: search filter, column sort, and the pristine rows
  // snapshot for dirty-tracking/reset. All die with the pause, so none persist.
  const [runInputSearch, setRunInputSearch] = useState("");
  const [runInputSort, setRunInputSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [runInputInitialRows, setRunInputInitialRows] = useState<Array<Record<string, string>>>([]);

  // Grade-aware behavior (stats, validation) applies to tables carrying a
  // grade column (the grading review); everything else stays generic.
  const tableHasGrade =
    runInput?.kind === "table" && (runInput.columns ?? []).some((c) => c.key === "grade");

  // While an editable cell has focus, the display order/membership is frozen
  // to these original indices so typing in a sorted/searched column does not
  // reorder or hide the row mid-edit (which would also steal focus).
  const [tableFrozenOrder, setTableFrozenOrder] = useState<number[] | null>(null);

  // The display list: original indices ride along so selection, details, and
  // edits stay keyed to the underlying rows while the view filters/sorts.
  useMemo(() => {
    if (!runInput || runInput.kind !== "table") return [];
    if (tableFrozenOrder) {
      return tableFrozenOrder
        .map((index) => ({ row: runInputRows[index], index }))
        .filter((entry) => entry.row !== undefined);
    }
    const query = runInputSearch.trim().toLowerCase();
    let list = runInputRows.map((row, index) => ({ row, index }));
    if (query) {
      const keys = (runInput.columns ?? []).filter((c) => !c.link).map((c) => c.key);
      list = list.filter(({ row }) => keys.some((k) => (row[k] ?? "").toLowerCase().includes(query)));
    }
    if (runInputSort) {
      const { key, dir } = runInputSort;
      list = [...list].sort(
        (a, b) => (dir === "asc" ? 1 : -1) * compareTableValues(a.row[key] ?? "", b.row[key] ?? "")
      );
    }
    return list;
  }, [runInput, runInputRows, runInputSearch, runInputSort, tableFrozenOrder]);

  useMemo(() => {
    if (!tableHasGrade) return null;
    const values: number[] = [];
    let invalid = 0;
    let missing = 0;
    for (const row of runInputRows) {
      if ((row.grade ?? "").trim() === "") missing += 1;
      else if (tableGradeIssue(row)) invalid += 1;
      else values.push(parseFloat(row.grade));
    }
    if (values.length === 0) return { invalid, missing, avg: null as number | null, median: null as number | null, min: null as number | null, max: null as number | null };
    const sorted = [...values].sort((x, y) => x - y);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const median =
      sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    return { invalid, missing, avg, median, min: sorted[0], max: sorted[sorted.length - 1] };
  }, [tableHasGrade, runInputRows]);

  // Compact distribution bar data: counts per percentage band, current rows,
  // recomputed as grades are edited. Rows that cannot be percentage-banded
  // (no grade, invalid, or no outOf) are excluded from the bar entirely -
  // null when there is nothing bandable yet, so the bar can hide itself.
  useMemo(() => {
    if (!tableHasGrade) return null;
    const counts: Record<Exclude<GradeBand, "neutral">, number> = {
      success: 0,
      accent: 0,
      warning: 0,
      danger: 0,
    };
    for (const row of runInputRows) {
      const { band } = tableGradeBand(row);
      if (band !== "neutral") counts[band] += 1;
    }
    const total = counts.success + counts.accent + counts.warning + counts.danger;
    if (total === 0) return null;
    const segments: Array<{ band: Exclude<GradeBand, "neutral">; label: string; count: number }> = [
      { band: "success", label: "90%+", count: counts.success },
      { band: "accent", label: "80-89%", count: counts.accent },
      { band: "warning", label: "70-79%", count: counts.warning },
      { band: "danger", label: "below 70%", count: counts.danger },
    ];
    return {
      total,
      segments,
      ariaLabel: segments.map((s) => `${s.count} at ${s.label}`).join(", "),
    };
  }, [tableHasGrade, runInputRows]);

  const [pendingHandoff, setPendingHandoff] = useState<{ workflowId: string; prefill: Record<string, string> } | null>(null);

  const [uploadFiles, setUploadFiles] = useState<Record<string, File[]>>({});

  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Master-detail layout: which sub-tab of the right panel is showing.
  const [panel, setPanel] = useState<"build" | "run" | "automate">("run");

  // Mirror `editing` into a ref so the focus refetch handler can skip
  // reloading while the builder is open without re-registering listeners.
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const [hubCourses, setHubCourses] = useState<Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null>(null);
  const [hubCoursesError, setHubCoursesError] = useState<string | null>(null);

  const [deckTemplates, setDeckTemplates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [deckTemplatesError, setDeckTemplatesError] = useState<string | null>(null);

  const [lmsCourseOptions, setLmsCourseOptions] = useState<Array<{ url: string; name: string }> | null>(null);
  const [lmsCourseOptionsError, setLmsCourseOptionsError] = useState<string | null>(null);

  const [lmsModuleOptions, setLmsModuleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [lmsModuleError, setLmsModuleError] = useState<string | null>(null);
  // True while the module options are export-sourced (no live LMS connection).
  const [lmsModuleFromExport, setLmsModuleFromExport] = useState(false);

  // Scheduled runs for the signed-in user (null = not loaded yet).
  const [schedules, setSchedules] = useState<WorkflowSchedule[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<{ runAt: string; repeat: ScheduleRepeat; intervalValue: string; intervalUnit: "minutes" | "hours"; courseId: string; institution: string; unattended: boolean } | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleRemoveConfirm, setScheduleRemoveConfirm] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  // Event triggers for the signed-in user (null = not loaded yet).
  const [triggers, setTriggers] = useState<WorkflowTrigger[] | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerForm, setTriggerForm] = useState<{
    eventType: TriggerEventType;
    config: Record<string, string>;
    courseId: string;
    institution: string;
    unattended: boolean;
  } | null>(null);
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [triggerRemoveConfirm, setTriggerRemoveConfirm] = useState<string | null>(null);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [webhookSetup, setWebhookSetup] = useState<
    | null
    | { ok: true; org: string; url: string; alreadyExisted: boolean }
    | { ok: false; org: string; url: string; error: string }
  >(null);

  // Parsed course exports keyed by course id; promises so concurrent readers
  // (module picker + running steps) share one download.
  const courseExportCacheRef = useRef<Map<string, Promise<CartridgeCourseData | null>>>(new Map());

  const [orgs, setOrgs] = useState<string[] | null>(null);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  // Include steps expand before anything reads the step list: the run form,
  // step overview, and runner all operate on expanded coordinates.
  const expanded = useMemo<{
    steps: WorkflowStepConfig[];
    origins: Array<string | null>;
    topIndices: number[];
    error: string | null;
  }>(() => {
    if (!selectedDef) return { steps: [], origins: [], topIndices: [], error: null };
    try {
      return {
        ...expandWorkflowDef(selectedDef, (id) =>
          workflows.find((w) => w.id === id)
        ),
        error: null,
      };
    } catch (err) {
      return {
        steps: [],
        origins: [],
        topIndices: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [selectedDef, workflows]);

  // Whether the selected workflow is eligible for the "run unattended" opt-in
  // on the schedule form - every expanded step must be headless-safe (see
  // workflows/headless.ts). Interactive workflows never show the checkbox.
  const selectedHeadlessSafe = useMemo(
    () =>
      selectedDef
        ? isHeadlessSafeWorkflow(selectedDef, (id) => workflows.find((w) => w.id === id))
        : false,
    [selectedDef, workflows]
  );

  // Check if a workflow (by id) is headless-safe, for use in conditionally
  // showing unattended execution checkboxes across multiple render sites.
  const isWorkflowHeadlessSafeById = useCallback(
    (id: string) => {
      const w = workflows.find((wf) => wf.id === id);
      return w ? isHeadlessSafeWorkflow(w, (depId) => workflows.find((wf) => wf.id === depId)) : false;
    },
    [workflows]
  );

  // Per-workflow map of enabled automation (schedules and triggers) for use in
  // the sidebar dots and the Automate panel overview.
  const automationByWorkflow = useMemo(() => {
    const map = new Map<string, { scheduled: boolean; triggered: boolean; scheduleCount: number; triggerCount: number }>();
    const ensure = (id: string) => {
      let e = map.get(id);
      if (!e) { e = { scheduled: false, triggered: false, scheduleCount: 0, triggerCount: 0 }; map.set(id, e); }
      return e;
    };
    for (const s of schedules ?? []) { if (s.enabled) { const e = ensure(s.workflowId); e.scheduled = true; e.scheduleCount++; } }
    for (const t of triggers ?? []) { if (t.enabled) { const e = ensure(t.workflowId); e.triggered = true; e.triggerCount++; } }
    return map;
  }, [schedules, triggers]);

  // Steps whose top-level index the user has disabled are excluded here so
  // the run form never asks for inputs needed only by a disabled step (a
  // field shared with an enabled step still appears - first-occurrence-wins
  // in collectRuntimeFields naturally handles that once disabled steps are
  // simply absent from the list it walks).
  const enabledExpandedSteps = useMemo(
    () => expanded.steps.filter((_, i) => !disabledSteps.has(expanded.topIndices[i])),
    [expanded, disabledSteps]
  );

  const runtimeFields: RuntimeField[] = useMemo(
    () =>
      selectedDef
        ? collectRuntimeFields(
            { ...selectedDef, steps: enabledExpandedSteps },
            (type) => {
              const def = getStepDefinition(type);
              return def?.inputs;
            }
          )
        : [],
    [selectedDef, enabledExpandedSteps]
  );

  // Run requires at least one enabled step - a workflow with every step
  // toggled off would run the loop and finish having done nothing.
  const allStepsDisabled = expanded.steps.length > 0 && enabledExpandedSteps.length === 0;

  // Top-level indices of disabled steps that an ENABLED step still binds to
  // by "step" output - surfaced in the overview as a subtle heads-up (not a
  // block: disabling stays allowed, dependents just cascade-skip at run
  // time with their own clear message).
  const disabledStepsWithEnabledDependents = useMemo(() => {
    const result = new Set<number>();
    expanded.steps.forEach((step, i) => {
      if (disabledSteps.has(expanded.topIndices[i])) return;
      for (const binding of Object.values(step.bindings)) {
        if (binding.source === "step") {
          const producerTop = expanded.topIndices[binding.stepIndex];
          if (producerTop !== undefined && disabledSteps.has(producerTop)) {
            result.add(producerTop);
          }
        }
      }
    });
    return result;
  }, [expanded, disabledSteps]);

  // Seed empty institution fields from the active institution during render
  // (guarded by a marker so each field set seeds once), so no effect calls
  // setState synchronously.
  const [seededInstMarker, setSeededInstMarker] = useState("");
  const unseededInstitutionKeys = runtimeFields
    .filter(
      (f) => f.type === "institution" && !(values[f.fieldKey] ?? "").trim()
    )
    .map((f) => f.fieldKey);
  const seedKey =
    activeInstitution && unseededInstitutionKeys.length > 0
      ? `${selectedWorkflowId}:${activeInstitution}:${unseededInstitutionKeys.join(",")}`
      : "";
  if (seedKey && seedKey !== seededInstMarker) {
    setSeededInstMarker(seedKey);
    setValues((prev) => ({
      ...prev,
      ...Object.fromEntries(
        unseededInstitutionKeys.map((k) => [k, activeInstitution])
      ),
    }));
  }

  // lmsModule options come from the course chosen by the form's FIRST
  // hubCourse-typed field; a tile without a live LMS connection keeps an
  // empty list and the renderer shows the export-fallback hint instead.
  const lmsModuleNeeded = runtimeFields.some((x) => x.type === "lmsModule");
  const firstHubCourseValue = (() => {
    const f = runtimeFields.find((x) => x.type === "hubCourse");
    return f ? (values[f.fieldKey] ?? "") : "";
  })();
  const lmsModuleCanvasUrl =
    hubCourses?.find((c) => c.id === firstHubCourseValue.trim())?.canvasUrl ??
    "";

  // Reset the module options during render when the source course changes,
  // so the fetch effect below never calls setState synchronously.
  const moduleSource = lmsModuleNeeded
    ? `${firstHubCourseValue}|${lmsModuleCanvasUrl}`
    : "";
  const [prevModuleSource, setPrevModuleSource] = useState(moduleSource);
  if (moduleSource !== prevModuleSource) {
    setPrevModuleSource(moduleSource);
    setLmsModuleOptions([]);
    setLmsModuleError(null);
    setLmsModuleFromExport(false);
  }

  // Download and parse the newest LMS export saved on a course tile; shared by
  // the module picker fallback and running steps (helpers.loadCourseExport).
  // The course row is re-read every call so a freshly saved export is picked
  // up; only the expensive download+parse is cached, keyed by storage path.
  const loadCourseExportData = useCallback(
    async (courseId: string): Promise<CartridgeCourseData | null> => {
      if (!user) return null;
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const course = list.courses.find((c) => c.id === courseId);
      if (!course || course.exportFiles.length === 0) return null;
      const latest = course.exportFiles.reduce((a, b) => (b.addedAt > a.addedAt ? b : a));
      const cached = courseExportCacheRef.current.get(latest.path);
      if (cached) return cached;
      const promise = (async () => {
        const blob = await downloadCourseZipBlob(supabase, latest);
        return await parseCartridgeBlob(blob);
      })();
      courseExportCacheRef.current.set(latest.path, promise);
      // Evict failures so a retry can succeed.
      promise.catch(() => courseExportCacheRef.current.delete(latest.path));
      return promise;
    },
    [user, supabase]
  );

  useEffect(() => {
    if (!lmsModuleNeeded) return;
    const courseId = firstHubCourseValue.trim();

    let cancelled = false;

    // Offer the modules from the course's LMS export when the live LMS is
    // unavailable (no connection, or the live call failed).
    const loadExportOptions = async (liveError: string | null) => {
      if (!courseId) return;
      try {
        const data = await loadCourseExportData(courseId);
        if (cancelled) return;
        if (data && data.modules.length > 0) {
          setLmsModuleOptions(
            data.modules.map((m) => ({
              value: exportModuleValue(m.name),
              label: m.name,
            }))
          );
          setLmsModuleFromExport(true);
        }
        setLmsModuleError(liveError);
      } catch (err) {
        if (!cancelled) {
          setLmsModuleError(
            liveError ?? (err instanceof Error ? err.message : "Could not load modules.")
          );
        }
      }
    };

    if (!lmsModuleCanvasUrl) {
      // Wait for the course list before deciding the course has no live LMS:
      // during the initial hubCourses load the canvasUrl is simply unknown,
      // and prematurely downloading the export here would waste a large fetch
      // for live-connected courses.
      if (hubCourses !== null) {
        void loadExportOptions(null);
      }
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const content = await listCourseContentAction(
          lmsModuleCanvasUrl,
          activeInstitution || undefined
        );
        if (cancelled) return;
        if ("error" in content) {
          await loadExportOptions(content.error);
        } else {
          setLmsModuleOptions(
            content.modules.map((m: CanvasModule) => ({
              value: liveModuleValue(m.id, m.name),
              label: m.name,
            }))
          );
          setLmsModuleError(null);
          setLmsModuleFromExport(false);
        }
      } catch (err) {
        if (!cancelled) {
          await loadExportOptions(
            err instanceof Error ? err.message : "Could not load modules."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lmsModuleNeeded, lmsModuleCanvasUrl, firstHubCourseValue, activeInstitution, loadCourseExportData, hubCourses]);

  const updateCustom = (next: WorkflowDef[]) => {
    setCustom(next);
    if (!user) {
      saveCustomWorkflows(next);
    }
  };

  useEffect(() => {
    if (!user || !supabase) return;

    let cancelled = false;

    (async () => {
      try {
        const dbRows = await listWorkflowDefs(supabase, user.id);

        if (!cancelled) {
          if (dbRows.length === 0) {
            const localRows = loadCustomWorkflows();
            if (localRows.length > 0) {
              let allUpserted = true;
              for (const def of localRows) {
                try {
                  await upsertWorkflowDef(supabase, user.id, def);
                } catch (err) {
                  console.error("Failed to migrate workflow:", def.id, err);
                  allUpserted = false;
                }
              }

              if (allUpserted) {
                try {
                  localStorage.removeItem("ta-workflows");
                } catch {
                  // Ignore storage failures.
                }
                const migratedRows = await listWorkflowDefs(supabase, user.id);
                setCustom(migratedRows);
              }
            }
          } else {
            setCustom(dbRows);
          }
          // Custom defs are now authoritative; scheduled runs of custom
          // workflows may consume (they wait for this flag).
          setCustomLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load workflows from database:", err);
        if (!cancelled) setCustomLoadFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  useEffect(() => {
    localStorage.setItem("ta-workflows-selected", selectedWorkflowId);
  }, [selectedWorkflowId]);

  useEffect(() => {
    if (selectedDef) {
      localStorage.setItem(
        `ta-workflow-values-${selectedDef.id}`,
        JSON.stringify(values)
      );
    }
  }, [values, selectedDef]);

  useEffect(() => {
    if (selectedDef) {
      saveDisabledSteps(selectedDef.id, Array.from(disabledSteps));
    }
  }, [disabledSteps, selectedDef]);

  useEffect(() => {
    if (user && supabase) {
      const handleFocus = () => {
        // Skip while the builder is open: a refetch could overwrite edits
        // still waiting inside the debounced save window.
        if (editingRef.current) return;

        (async () => {
          try {
            const dbRows = await listWorkflowDefs(supabase, user.id);
            setCustom(dbRows);
          } catch (err) {
            console.error("Failed to reload workflows from database:", err);
          }
        })();
      };

      window.addEventListener("focus", handleFocus);
      return () => {
        window.removeEventListener("focus", handleFocus);
      };
    } else {
      const handleStorageChange = () => {
        setCustom(loadCustomWorkflows());
      };

      window.addEventListener("storage", handleStorageChange);
      window.addEventListener("focus", handleStorageChange);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("focus", handleStorageChange);
      };
    }
  }, [user, supabase]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (user && supabase && pendingDefRef.current) {
        void upsertWorkflowDef(supabase, user.id, pendingDefRef.current).catch(
          console.error
        );
      }
    };
  }, [user, supabase]);

  // Load the user's scheduled runs once per mount. The signed-out reset also
  // happens after an await so no setState is reached synchronously from the
  // effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        await Promise.resolve();
        if (!cancelled) setSchedules([]);
        return;
      }
      try {
        const rows = await listWorkflowSchedules(supabase, user.id);
        if (!cancelled) {
          setSchedules(rows);
          setScheduleError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setScheduleError(err instanceof Error ? err.message : "Could not load schedules.");
          setSchedules([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Load the user's event triggers once per mount (mirrors the schedule load).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        await Promise.resolve();
        if (!cancelled) setTriggers([]);
        return;
      }
      try {
        const rows = await listWorkflowTriggers(supabase, user.id);
        if (!cancelled) {
          setTriggers(rows);
          setTriggerError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTriggerError(err instanceof Error ? err.message : "Could not load triggers.");
          setTriggers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Consume queued scheduled runs (claimed by the page-level watcher) once the
  // tab is idle: each becomes a normal auto-run handoff. Runs whose workflow
  // id is not found stay queued until the async custom-def load settles
  // (customLoaded); only then are they treated as deleted, and their schedule
  // is disabled so a repeating schedule cannot grab the tab forever.
  useEffect(() => {
    const consume = () => {
      if (running || pendingHandoff) return;
      const next = peekScheduledRun();
      if (!next) return;
      if (!workflows.some((w) => w.id === next.workflowId)) {
        if (user && !customLoaded && !customLoadFailed) return;
        takeScheduledRun();
        if (customLoadFailed) {
          // The defs may exist but could not be loaded: skip without
          // disabling the schedule.
          setValidationError(
            `Could not load your custom workflows, so the scheduled run of "${next.workflowName}" was skipped.`
          );
          return;
        }
        setValidationError(
          `Workflow "${next.workflowName}" no longer exists; its schedule or trigger has been disabled.`
        );
        // A queued run carries EITHER a scheduleId (time schedule) or a
        // triggerId (event trigger); disable whichever produced this orphan so
        // a repeating source cannot grab the tab forever.
        if (user && next.scheduleId) {
          const scheduleId = next.scheduleId;
          void updateWorkflowSchedule(supabase, user.id, scheduleId, { enabled: false })
            .then(() => {
              setSchedules((prev) =>
                (prev ?? []).map((x) => (x.id === scheduleId ? { ...x, enabled: false } : x))
              );
            })
            .catch((err) => console.error("Failed to disable orphaned schedule:", err));
        }
        if (user && next.triggerId) {
          const triggerId = next.triggerId;
          void updateWorkflowTrigger(supabase, user.id, triggerId, { enabled: false })
            .then(() => {
              setTriggers((prev) =>
                (prev ?? []).map((x) => (x.id === triggerId ? { ...x, enabled: false } : x))
              );
            })
            .catch((err) => console.error("Failed to disable orphaned trigger:", err));
        }
        return;
      }
      takeScheduledRun();
      setPendingHandoff({ workflowId: next.workflowId, prefill: next.fieldValues });
    };
    consume();
    window.addEventListener(SCHEDULED_RUN_EVENT, consume);
    return () => window.removeEventListener(SCHEDULED_RUN_EVENT, consume);
  });

  useEffect(() => {
    const needsHubCourse =
      runtimeFields.some((f) => f.type === "hubCourse" || f.type === "hubCourseList") ||
      panel === "build" ||
      scheduleForm !== null ||
      triggerForm !== null ||
      (schedules ?? []).some((s) => s.courseId);
    if (!needsHubCourse || hubCourses !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listCourseHubAction();
        if (!cancelled) {
          if ("error" in list) {
            setHubCoursesError(list.error);
          } else {
            setHubCourses(list.courses.map((c) => ({ id: c.id, name: c.name, canvasUrl: c.canvasUrl ?? null, repos: (c.repos || []).map((x) => x.repo) })));
            setHubCoursesError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setHubCoursesError(err instanceof Error ? err.message : "Could not load courses.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, hubCourses, scheduleForm, schedules, triggerForm, panel]);

  useEffect(() => {
    const needsDeckTemplates =
      runtimeFields.some((f) => f.type === "deckTemplate") ||
      panel === "build";
    if (!needsDeckTemplates || deckTemplates !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listDeckTemplatesAction();
        if (!cancelled) {
          const presets = DECK_PRESETS.map((p) => ({ id: p.id, name: p.name }));
          if ("error" in list) {
            // Still offer the built-in presets so the picker is never stuck empty.
            setDeckTemplates(presets);
            setDeckTemplatesError(list.error);
          } else {
            setDeckTemplates([...presets, ...list.templates.map((t) => ({ id: t.id, name: t.name }))]);
            setDeckTemplatesError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setDeckTemplates(DECK_PRESETS.map((p) => ({ id: p.id, name: p.name })));
          setDeckTemplatesError(err instanceof Error ? err.message : "Could not load templates.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, deckTemplates, panel]);

  useEffect(() => {
    const needsLmsCourseList =
      panel === "build" || runtimeFields.some((f) => f.type === "lmsCourseList");
    if (!needsLmsCourseList || lmsCourseOptions !== null || !activeInstitution) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await listCoursesAction(activeInstitution);
        if (!cancelled) {
          if ("error" in result) {
            setLmsCourseOptionsError(result.error);
          } else {
            setLmsCourseOptions(
              result.courses.map((c) => ({
                url: `/courses/${c.id}`,
                name: c.name,
              }))
            );
            setLmsCourseOptionsError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLmsCourseOptionsError(err instanceof Error ? err.message : "Could not load courses.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, lmsCourseOptions, activeInstitution, panel]);

  useEffect(() => {
    const needsOrg =
      panel === "build" || runtimeFields.some((f) => f.type === "org" || f.type === "orgList");
    if (!needsOrg || orgs !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const r = await listMyOrgsAction();
        if (!cancelled) {
          if ("error" in r) {
            setOrgsError(r.error);
          } else {
            setOrgs(r.orgs);
            setOrgsError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setOrgsError(err instanceof Error ? err.message : "Could not load organizations.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, orgs, panel]);

  const handleWorkflowChange = (newId: string) => {
    setSelectedWorkflowId(newId);
    setEditing(false);
    setDeleteArmed(false);
    // Load saved values by id (not via the workflows closure, which is stale
    // right after creating/duplicating) so the previous workflow's form values
    // never leak into the newly selected one.
    const saved = localStorage.getItem(`ta-workflow-values-${newId}`);
    if (saved) {
      try {
        setValues(JSON.parse(saved));
      } catch {
        setValues({});
      }
    } else {
      setValues({});
    }
    // Same lifecycle as values: the disabled-step overlay is per workflow id,
    // so it is rehydrated (not carried over) whenever the selection changes.
    setDisabledSteps(new Set(loadDisabledSteps(newId)));
  };

  // Set the selected (custom) workflow's workflow-level targets and persist.
  const handleScopeChange = (scope: WorkflowScope) => {
    if (!selectedDef || selectedDef.preset) return;
    // selectedDef already reflects any in-flight builder step edit, so `next`
    // carries both. Cancel the builder's pending debounced save (whose queued
    // def has no scope) so it cannot clobber this write.
    const next: WorkflowDef = { ...selectedDef, scope };
    updateCustom(custom.map((w) => (w.id === next.id ? next : w)));
    if (user && supabase) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingDefRef.current = null;
      void upsertWorkflowDef(supabase, user.id, next).catch(console.error);
    }
  };

  // A preset is read-only, so its "This workflow is for" targets cannot be
  // edited in place. Setting them creates the user's own editable copy carrying
  // that scope and selects it - the same customize-by-duplicate model as the
  // Duplicate button (and the only shape whose scope persists server-side so
  // scheduled/triggered runs honor it), just reachable straight from the panel.
  const handlePresetScope = (scope: WorkflowScope) => {
    if (!selectedDef) return;
    const copied: WorkflowDef = {
      id: crypto.randomUUID(),
      name: `${selectedDef.name} (copy)`,
      description: selectedDef.description,
      steps: JSON.parse(JSON.stringify(selectedDef.steps)),
      scope,
    };
    updateCustom([...custom, copied]);
    if (user && supabase) {
      void upsertWorkflowDef(supabase, user.id, copied).catch(console.error);
    }
    handleWorkflowChange(copied.id);
  };

  const handleValueChange = (fieldKey: string, value: string) => {
    const field = runtimeFields.find((f) => f.fieldKey === fieldKey);

    // Picking a repo that is attached to a course tile pre-selects that tile
    // (and its LMS course when empty); later manual changes are respected
    // because this only runs when the repo field itself changes.
    if (field?.type === "repo" && hubCourses && value.trim()) {
      const m = value.match(/github\.com\/([^/\s]+\/[^/\s#?]+)/);
      const ref = (m ? m[1] : value).trim().replace(/\.git$/, "").toLowerCase();

      const match = hubCourses.find((c) => c.repos.some((r) => r.toLowerCase() === ref));

      if (match) {
        setValues((prev) => {
          const next = { ...prev, [fieldKey]: value };

          // Find first hubCourse field and set it
          const hubCourseField = runtimeFields.find((f) => f.type === "hubCourse");
          if (hubCourseField) {
            next[hubCourseField.fieldKey] = match.id;
          }

          // Find first lmsCourse field, set it if empty and canvasUrl exists
          const lmsCourseField = runtimeFields.find((f) => f.type === "lmsCourse");
          if (lmsCourseField && !prev[lmsCourseField.fieldKey] && match.canvasUrl) {
            next[lmsCourseField.fieldKey] = match.canvasUrl;
          }

          return next;
        });
      } else {
        setValues((prev) => ({ ...prev, [fieldKey]: value }));
      }
    } else if (field?.type === "hubCourse") {
      // When switching hubCourse, clear all lmsModule-typed fields in the same update.
      // Module selections belong to the previously selected course.
      setValues((prev) => {
        const next = { ...prev, [fieldKey]: value };
        for (const moduleField of runtimeFields) {
          if (moduleField.type === "lmsModule") {
            next[moduleField.fieldKey] = "";
          }
        }
        return next;
      });
    } else {
      setValues((prev) => ({ ...prev, [fieldKey]: value }));
    }
  };

  const validateForm = (): boolean => {
    setValidationError(null);
    for (const field of runtimeFields) {
      if (!field.required) continue;

      // lmsModule stays out of the list: without a live LMS connection the
      // field renders only a fallback hint, so a required flag on it must
      // not block the run.
      const fieldTypes = ["text", "longtext", "number", "date", "repo", "lmsCourse", "lmsCourseList", "hubCourse", "org", "orgList", "institution", "hubCourseList", "uploads", "deckTemplate"];
      if (!fieldTypes.includes(field.type)) continue;

      if (field.type === "uploads") {
        const files = uploadFiles[field.fieldKey] ?? [];
        if (files.length === 0) {
          setValidationError(`${field.label} requires at least one file.`);
          return false;
        }
      } else if (field.type === "hubCourseList") {
        const ids = values[field.fieldKey]
          ?.split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];
        if (ids.length === 0) {
          setValidationError(`${field.label} requires at least one course.`);
          return false;
        }
      } else {
        const value = values[field.fieldKey] ?? "";
        if (!value.trim()) {
          setValidationError(`${field.label} is required.`);
          return false;
        }

        if (field.type === "number") {
          const num = Number(value);
          if (!Number.isFinite(num)) {
            setValidationError(`${field.label} must be a valid number.`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleRun = async () => {
    if (!selectedDef) return;
    if (expanded.error) return;
    // Surface the run in the Run panel BEFORE validating, so an auto-fired
    // scheduled/triggered run whose prefilled form fails validation shows its
    // error (which now lives in the Run panel) rather than failing invisibly.
    setPanel("run");
    // Scheduled runs and workflow handoffs land here too (both call
    // handleRun directly); reading disabledSteps at call time - rather than
    // snapshotting it into the schedule - means a scheduled run always
    // honors the user's CURRENT step toggles for this workflow.
    if (allStepsDisabled) return;
    if (!validateForm()) return;

    setRunning(true);
    setValidationError(null);
    setRunInput(null);
    setRunInputBusy(false);
    setRunInputError(null);
    inputResolverRef.current = null;

    // Fan out across every configured institution when the scope is institution
    // "*"; otherwise a single sub-run pinned to the active school. Mirrors
    // runWorkflowUnattended so attended and unattended cover the same schools.
    let fanoutInstitutions: Array<string | null>;
    if (isInstitutionFanout(selectedDef.scope)) {
      const resolved = await resolveFanoutInstitutions();
      if ("error" in resolved) {
        setValidationError(`Could not list institutions: ${resolved.error}`);
        setRunning(false);
        return;
      }
      if (resolved.list.length === 0) {
        setValidationError("No institutions are configured on the server.");
        setRunning(false);
        return;
      }
      fanoutInstitutions = resolved.list;
    } else {
      fanoutInstitutions = [null];
    }
    const makePendingSteps = (): StepState[] =>
      expanded.steps.map(() => ({
        status: "pending" as const,
        progress: null,
        summary: null,
        error: null,
      }));
    setRunState(fanoutInstitutions.map((institution) => ({ institution, steps: makePendingSteps() })));

    const workflowRunId = crypto.randomUUID();
    const helpers: StepRunHelpers = {
      activeInstitution: activeInstitution || null,
      provider: getStoredProvider(),
      author: resolveDocumentAuthor(user),
      saveBundle:
        user && supabase
          ? async (blob: Blob, name: string) => {
              await saveRecordingFile(supabase, user.id, blob, {
                name,
                kind: "bundle",
                mimeType: "application/zip",
                durationSec: null,
                source: "workflow",
                origin: "manual",
                workflowName: selectedDef.name,
                workflowId: selectedDef.id,
                workflowRunId,
              });
            }
          : null,
      // One storage object per artifact; the tile's materials list records
      // it, and a same-named replacement cleans up the orphaned object.
      saveCourseMaterialFile:
        user && supabase
          ? async (courseId: string, blob: Blob, fileName: string) => {
              const { path } = await uploadCourseZip(
                supabase,
                user.id,
                courseId,
                blob,
                null
              );
              const r = await appendCourseMaterialFileAction(courseId, {
                name: fileName,
                path,
                size: blob.size,
              });
              if ("error" in r) throw new Error(r.error);
              if (r.replacedPath) {
                await removeCourseZip(supabase, r.replacedPath);
              }
            }
          : null,
      saveCourseExportFile:
        user && supabase
          ? async (courseId: string, blob: Blob, fileName: string) => {
              const { path, parts } = await uploadCourseZipChunked(
                supabase,
                user.id,
                courseId,
                blob
              );
              const r = await appendCourseExportFileAction(courseId, {
                name: fileName,
                path,
                size: blob.size,
                ...(parts ? { parts } : {}),
              });
              if ("error" in r) {
                await removeCourseZipObjects(supabase, parts ?? [path]);
                throw new Error(r.error);
              }
              await removeCourseZipObjects(supabase, r.replacedPaths);
            }
          : null,
      loadCommonResources:
        user && supabase
          ? async () => loadCommonResources(supabase, user.id)
          : null,
      getLibraryFile:
        user && supabase
          ? async (fileId: string) => {
              const files = await listRecordingFiles(supabase, user.id);
              const f = files.find((x) => x.id === fileId);
              if (!f) return null;
              const blob = await downloadRecordingFile(supabase, f);
              return {
                blob,
                name: `${f.name}.${extForFile(f)}`,
                mimeType: f.mimeType,
              };
            }
          : null,
      getInstitutionFields:
        user && supabase
          ? async (acronym: string) =>
              loadInstitutionFields(supabase, user.id, acronym)
          : null,
      loadCourseExport: user && supabase ? loadCourseExportData : null,
      workflowId: selectedDef.id,
      workflowName: selectedDef.name,
      workflowRunId,
    };

    // Expanded steps carry bindings already translated into expanded
    // coordinates, so the runner indexes stepOutputs directly.
    let anyGenuineFailure = false;
    let aborted = false;

    for (let g = 0; g < fanoutInstitutions.length && !aborted; g++) {
      const institution = fanoutInstitutions[g];
      const groupScope = institution
        ? scopeForInstitution(selectedDef.scope!, institution)
        : selectedDef.scope;
      const groupHelpers: StepRunHelpers = institution
        ? { ...helpers, activeInstitution: institution }
        : helpers;

      const stepOutputs: Array<Record<string, unknown>> = [];
      const failedSteps = new Set<number>();
      const disabledRunIndices = new Set<number>();
      const skippedRunIndices = new Set<number>();

      for (let i = 0; i < expanded.steps.length; i++) {
      const step = expanded.steps[i];
      const def = getStepDefinition(step.type);

      // A step whose top-level index the user disabled is never run: mark it
      // and add it to failedSteps so any later step binding to its output
      // fails-forward through the existing cascade below, with a message
      // that calls out the disabled step specifically.
      if (disabledSteps.has(expanded.topIndices[i])) {
        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "disabled",
            progress: null,
            summary: null,
            error: null,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        failedSteps.add(i);
        disabledRunIndices.add(i);
        continue;
      }

      // "Run only if": a gated step whose condition is not met (or whose gating
      // step failed) is skipped - dependents cascade through failedSteps like a
      // disabled step, and it is not itself a failure.
      if (step.runIf) {
        const cond = step.runIf;
        let condVal: unknown = "";
        let gateUnavailable = false;
        if (cond.binding.source === "step") {
          if (failedSteps.has(cond.binding.stepIndex)) gateUnavailable = true;
          else condVal = stepOutputs[cond.binding.stepIndex]?.[cond.binding.outputKey];
        } else if (cond.binding.source === "literal") {
          condVal = cond.binding.value;
        } else if (cond.binding.source === "runtime") {
          condVal = values[cond.binding.fieldKey] ?? "";
        }
        const v = String(condVal).trim().toLowerCase();
        const truthy = v !== "" && v !== "0" && v !== "false";
        if (gateUnavailable || truthy !== cond.expected) {
          setRunState((prev) => {
            const next = [...prev];
            const steps = [...next[g].steps];
            steps[i] = {
              status: "skipped",
              progress: null,
              summary: null,
              error: null,
            };
            next[g] = { ...next[g], steps };
            return next;
          });
          failedSteps.add(i);
          skippedRunIndices.add(i);
          continue;
        }
      }

      // A step that consumes a gated-off (skipped) step's output is itself skipped
      // cleanly - the skip cascades transitively. (Disabled / genuinely-failed
      // dependencies still error via the binding-resolution branch below.)
      if (
        Object.values(step.bindings).some(
          (b) => b.source === "step" && skippedRunIndices.has(b.stepIndex)
        )
      ) {
        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "skipped",
            progress: null,
            summary: null,
            error: null,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        failedSteps.add(i);
        skippedRunIndices.add(i);
        continue;
      }

      setRunState((prev) => {
        const next = [...prev];
        const steps = [...next[g].steps];
        steps[i] = { ...steps[i], status: "running" };
        next[g] = { ...next[g], steps };
        return next;
      });

      try {
        if (!def) {
          throw new Error(`Unknown step type "${step.type}".`);
        }

        const resolvedInputs: Record<string, unknown> = {};
        for (const spec of def.inputs) {
          const binding = step.bindings[spec.key];
          if (!binding) {
            // An input with NO binding (a workflow authored before the step
            // gained this input) is still filled by the workflow scope when
            // the scope covers its family - mirroring the server runner.
            if (scopeCoversType(groupScope, spec.type)) {
              resolvedInputs[spec.key] = applyWorkflowScope(spec.type, "", groupScope);
            }
            continue;
          }

          if (binding.source === "runtime") {
            const field = runtimeFields.find((f) => f.fieldKey === binding.fieldKey);
            if (field?.type === "uploads") {
              // File objects cannot persist; resolve from non-persisted uploadFiles state.
              resolvedInputs[spec.key] = uploadFiles[binding.fieldKey] ?? [];
            } else {
              // An empty entity input falls back to the workflow's scope target.
              // A scope-COVERED input is filled from the scope directly (ignoring
              // any run-form value, which for a covered input can only come from
              // a sibling field sharing the key), so an "all" scope is not
              // narrowed by a single-input sibling.
              const runVal = scopeCoversType(groupScope, spec.type)
                ? ""
                : values[binding.fieldKey] ?? "";
              resolvedInputs[spec.key] = applyWorkflowScope(spec.type, runVal, groupScope);
            }
          } else if (binding.source === "step") {
            if (failedSteps.has(binding.stepIndex)) {
              const failedDef = getStepDefinition(expanded.steps[binding.stepIndex]?.type ?? "");
              const dependsOnDisabled = disabledSteps.has(expanded.topIndices[binding.stepIndex]);
              throw new Error(
                dependsOnDisabled
                  ? `Skipped - depends on step ${binding.stepIndex + 1} ("${failedDef?.name ?? "unknown step"}"), which is disabled.`
                  : `Skipped - depends on step ${binding.stepIndex + 1} ("${failedDef?.name ?? "unknown step"}"), which failed.`
              );
            }
            const output = stepOutputs[binding.stepIndex]?.[binding.outputKey];
            if (output === undefined) {
              throw new Error(`Missing output from step ${binding.stepIndex + 1}.`);
            }
            resolvedInputs[spec.key] = output;
          } else if (binding.source === "literal") {
            resolvedInputs[spec.key] = binding.value;
          }

          // Expand a scopeable input's "*" (all) sentinel into a concrete
          // newline-joined list so the action always receives a real list.
          // Canvas-course "*" enumerates the WORKFLOW'S scoped institution when
          // set (not the ambient top-bar one), so it targets the right school.
          if (isScopeableListType(spec.type) && typeof resolvedInputs[spec.key] === "string") {
            const scopeInst = applyWorkflowScope("institution", "", groupScope).trim();
            resolvedInputs[spec.key] = await expandScopedValue(
              spec.type,
              resolvedInputs[spec.key] as string,
              { activeInstitution: (scopeInst || groupHelpers.activeInstitution) || null }
            );
          }

          if (spec.type === "repo" && typeof resolvedInputs[spec.key] === "string") {
            resolvedInputs[spec.key] = await resolveClassRepoRef(resolvedInputs[spec.key] as string, groupScope);
          }

          if (
            (spec.type === "lmsCourse" || spec.type === "date" || spec.type === "institution") &&
            typeof resolvedInputs[spec.key] === "string"
          ) {
            resolvedInputs[spec.key] = await resolveClassTileRef(resolvedInputs[spec.key] as string, groupScope, spec.type);
          }
        }

        const onProgress = (text: string) => {
          setRunState((prev) => {
            const next = [...prev];
            const steps = [...next[g].steps];
            steps[i] = { ...steps[i], progress: text };
            next[g] = { ...next[g], steps };
            return next;
          });
        };

        const result = await def.run(resolvedInputs, groupHelpers, onProgress);
        stepOutputs[i] = result.outputs;

        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "done",
            progress: null,
            summary: result.summary,
            error: null,
          };
          next[g] = { ...next[g], steps };
          return next;
        });

        if (result.requireConfirmation) {
          await new Promise<void>((resolve) => {
            setRunPause({ groupIndex: g, stepIndex: i, message: result.requireConfirmation! });
            pauseResolverRef.current = {
              resolve: (go: boolean) => {
                setRunPause(null);
                pauseResolverRef.current = null;
                if (!go) {
                  failedSteps.add(i);
                  aborted = true;
                }
                resolve();
              },
            };
          });
          if (failedSteps.has(i)) {
            break;
          }
        }

        if (result.requireInput) {
          const inputOptions =
            result.requireInput.kind === "workflow"
              ? workflows
                  .filter((w) => w.id !== selectedWorkflowId)
                  .map((w) => ({ value: w.id, label: w.name }))
              : result.requireInput.options ?? [];

          setRunInputText(result.requireInput!.initialValue ?? "");
          setRunInputChoice("");
          setRunInputFiles([]);
          setRunInputRows(result.requireInput!.rows ?? []);
          const rows = result.requireInput!.rows ?? [];
          setRunInputChecked(rows.map(() => true));
          setRunInputError(null);
          setRunInputDetails({});
          setRunInputSearch("");
          setRunInputSort(null);
          setTableFrozenOrder(null);
          setRunInputInitialRows(rows.map((r) => ({ ...r })));

          await new Promise<void>((resolve) => {
            setRunInput({
              groupIndex: g,
              stepIndex: i,
              message: result.requireInput!.message,
              kind: result.requireInput!.kind,
              options: inputOptions,
              optional: !!result.requireInput!.optional,
              initialValue: result.requireInput!.initialValue,
              submitLabel: result.requireInput!.submitLabel,
              regenerate: result.requireInput!.regenerate,
              columns: result.requireInput!.columns,
              selectable: result.requireInput!.selectable,
              rowDetail: result.requireInput!.rowDetail,
              transform: result.requireInput!.transform,
            });
            inputResolverRef.current = {
              resolve: (value) => {
                setRunInput(null);
                inputResolverRef.current = null;
                if (value === null) {
                  if (!result.requireInput!.optional) {
                    failedSteps.add(i);
                    aborted = true;
                  }
                } else {
                  const merged =
                    result.requireInput!.kind !== "workflow" &&
                    result.requireInput!.transform
                      ? result.requireInput!.transform(
                          value as string | File[] | Array<Record<string, string>>
                        )
                      : value;
                  stepOutputs[i] = {
                    ...stepOutputs[i],
                    [result.requireInput!.key]: merged,
                  };
                  if (
                    result.requireInput!.kind === "workflow" &&
                    typeof value === "string" &&
                    value
                  ) {
                    setPendingHandoff({
                      workflowId: value,
                      prefill: result.requireInput!.handoffPrefill ?? {},
                    });
                  }
                }
                resolve();
              },
            };
          });
          if (failedSteps.has(i)) {
            break;
          }
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "error",
            progress: null,
            summary: null,
            error: errorMsg,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        failedSteps.add(i);
      }
    }
      anyGenuineFailure = anyGenuineFailure || failedSteps.size > disabledRunIndices.size + skippedRunIndices.size;
    }

    // A genuine failure or cancel must not fire the mid-run handoff - but
    // user-disabled steps sit in failedSteps only to drive the dependency
    // cascade, so they do not count as failures here. If the only entries
    // are the disabled steps, the run had no real failure and a handoff
    // emitted by a step that actually ran should still fire.
    if (anyGenuineFailure) {
      setPendingHandoff(null);
    }

    // Log the completion so a 'workflow-completed' (chaining) trigger can fire
    // off this run. Best-effort; never blocks or breaks the run. A run whose
    // only "failures" are user-disabled steps is not a genuine failure (mirrors
    // the handoff guard above).
    if (user && supabase && selectedDef) {
      const genuineFailure = anyGenuineFailure;
      void recordWorkflowRun(supabase, user.id, {
        workflowId: selectedDef.id,
        workflowName: selectedDef.name,
        status: genuineFailure ? "error" : "ok",
        triggerSource: "manual",
        id: workflowRunId,
      }).catch((err) => console.error("Failed to record workflow run:", err));
    }

    // Re-arm the lazy fetch so runs that created/updated tiles refresh the pickers
    setHubCourses(null);
    setRunning(false);
  };

  // Fire a workflow handoff chosen mid-run: select the target workflow, set its
  // values to ONLY the handoff prefill, and auto-run on the settled render.
  // handleWorkflowChange rehydrates the target's saved values from localStorage;
  // we then overwrite that map entirely with the prefill so stale saved values
  // (e.g. an lmsModule id from a different course) never ride along. Any missing
  // required field then fails validateForm, stopping the auto-run at the form.
  // Declared after handleRun so the effect references it post-declaration; the
  // two-phase ref dance runs handleRun only once selection/values have settled.
  const handoffArmedRef = useRef(false);
  useEffect(() => {
    if (!pendingHandoff || running) return;
    if (!handoffArmedRef.current) {
      handoffArmedRef.current = true;
      handleWorkflowChange(pendingHandoff.workflowId);
      setValues(pendingHandoff.prefill);
      return;
    }
    handoffArmedRef.current = false;
    setPendingHandoff(null);
    void handleRun();
    // handleRun is recreated every render; depending on it would refire the
    // effect mid-dance, so the deps list is intentionally narrower.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHandoff, running, selectedWorkflowId, values]);

  // Validate schedule form: returns { ok, intervalMinutes, error }.
  // Used by both create and edit paths.
  const validateScheduleForm = (
    form: typeof scheduleForm
  ): { ok: true; intervalMinutes: number | null } | { ok: false; error: string } => {
    if (!form) return { ok: false, error: "No form data" };
    const runAt = new Date(form.runAt);
    if (Number.isNaN(runAt.getTime())) {
      return { ok: false, error: "Pick a valid first run time." };
    }
    if (runAt.getTime() <= Date.now()) {
      return { ok: false, error: "Pick a time in the future." };
    }
    let intervalMinutes: number | null = null;
    if (form.repeat === "interval") {
      const raw = Number(form.intervalValue);
      if (!Number.isFinite(raw) || raw <= 0) {
        return { ok: false, error: "Enter how often it should repeat." };
      }
      intervalMinutes = form.intervalUnit === "hours" ? Math.round(raw * 60) : Math.round(raw);
      if (intervalMinutes < MIN_INTERVAL_MINUTES) {
        return { ok: false, error: `The shortest interval is ${MIN_INTERVAL_MINUTES} minutes.` };
      }
    }
    return { ok: true, intervalMinutes };
  };

  // Create a schedule for the selected workflow from the current form values.
  const handleCreateSchedule = async () => {
    if (!user || !selectedDef || !scheduleForm) return;
    const validation = validateScheduleForm(scheduleForm);
    if (!validation.ok) {
      setScheduleError(validation.error);
      return;
    }
    const { intervalMinutes } = validation;
    const runAt = new Date(scheduleForm.runAt);
    setScheduleBusy(true);
    setScheduleError(null);
    try {
      const created = await createWorkflowSchedule(supabase, user.id, {
        workflowId: selectedDef.id,
        workflowName: selectedDef.name,
        fieldValues: values,
        nextRunAt: runAt.toISOString(),
        repeat: scheduleForm.repeat,
        intervalMinutes,
        courseId: scheduleForm.courseId || null,
        institution: scheduleForm.institution || null,
        // Only meaningful when selectedHeadlessSafe gated the checkbox
        // visible; otherwise scheduleForm.unattended stays false. provider
        // and disabledSteps are snapshotted regardless - harmless for
        // app-open schedules, which never read them.
        unattended: selectedHeadlessSafe && scheduleForm.unattended,
        provider: getStoredProvider(),
        disabledSteps: Array.from(disabledSteps),
      });
      setSchedules((prev) =>
        [...(prev ?? []), created].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
      );
      setScheduleForm(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not save the schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  // Save changes to an existing schedule.
  const handleSaveEditSchedule = async (scheduleId: string) => {
    if (!user || !scheduleForm) return;
    const editingSchedule = schedules?.find((s) => s.id === scheduleId);
    if (!editingSchedule) return;
    const editingIsHeadlessSafe = isWorkflowHeadlessSafeById(editingSchedule.workflowId);
    const validation = validateScheduleForm(scheduleForm);
    if (!validation.ok) {
      setScheduleError(validation.error);
      return;
    }
    const { intervalMinutes } = validation;
    const runAt = new Date(scheduleForm.runAt);
    setScheduleBusy(true);
    setScheduleError(null);
    try {
      await updateWorkflowSchedule(supabase, user.id, scheduleId, {
        nextRunAt: runAt.toISOString(),
        repeat: scheduleForm.repeat,
        intervalMinutes: scheduleForm.repeat === "interval" ? intervalMinutes : null,
        courseId: scheduleForm.courseId || null,
        institution: scheduleForm.institution || null,
        unattended: editingIsHeadlessSafe && scheduleForm.unattended,
      });
      setSchedules((prev) =>
        (prev ?? [])
          .map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  nextRunAt: runAt.toISOString(),
                  repeat: scheduleForm.repeat,
                  intervalMinutes: scheduleForm.repeat === "interval" ? intervalMinutes : null,
                  courseId: scheduleForm.courseId || null,
                  institution: scheduleForm.institution || null,
                  unattended: editingIsHeadlessSafe && scheduleForm.unattended,
                }
              : s
          )
          .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
      );
      setScheduleForm(null);
      setEditingScheduleId(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not save the schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleToggleSchedule = async (s: WorkflowSchedule) => {
    if (!user) return;
    // Re-enabling: use the tested reenableSchedule helper for consistent logic
    let nextRunAt: string | undefined;
    if (!s.enabled) {
      const rearm = reenableSchedule(s);
      if (!rearm.ok) {
        setScheduleError("That one-time schedule is in the past - create a new one instead.");
        return;
      }
      nextRunAt = rearm.nextRunAt;
    }
    try {
      await updateWorkflowSchedule(supabase, user.id, s.id, {
        enabled: !s.enabled,
        ...(nextRunAt ? { nextRunAt } : {}),
      });
      setSchedules((prev) =>
        (prev ?? []).map((x) =>
          x.id === s.id ? { ...x, enabled: !s.enabled, nextRunAt: nextRunAt ?? x.nextRunAt } : x
        )
      );
      setScheduleError(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not update the schedule.");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!user) return;
    try {
      await deleteWorkflowSchedule(supabase, user.id, id);
      setSchedules((prev) => (prev ?? []).filter((x) => x.id !== id));
      setScheduleRemoveConfirm(null);
      setScheduleError(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not delete the schedule.");
    }
  };

  // Validate trigger form: returns { ok, eventConfig, error }.
  // Used by both create and edit paths. Computes eventConfig with scope inheritance.
  const validateTriggerForm = (
    form: typeof triggerForm,
    workflowDef: typeof selectedDef
  ): { ok: true; eventConfig: Record<string, string> } | { ok: false; error: string } => {
    if (!form) return { ok: false, error: "No form data" };
    const source = getEventSource(form.eventType);
    if (!source) {
      return { ok: false, error: "Pick an event." };
    }
    // Every required config field for this event source must be filled.
    for (const field of source.configFields) {
      if (field.required && !(form.config[field.key] ?? "").trim()) {
        return { ok: false, error: `${field.label} is required for this event.` };
      }
    }
    // An lmsCourse value must contain a Canvas course id, or the server-side
    // evaluator's /courses/(\d+)/ parse will silently never match and the
    // trigger will save but never fire.
    for (const field of source.configFields) {
      if (field.type !== "lmsCourse") continue;
      const fieldValue = (form.config[field.key] ?? "").trim();
      if (fieldValue && !/courses\/\d+/.test(fieldValue)) {
        return { ok: false, error: "Enter the Canvas course URL (it must contain /courses/<id>)." };
      }
    }
    // The deadline trigger inherits the course/institution the workflow is
    // already set for ("This workflow is for") when its own fields are blank, so
    // they are not entered twice. Snapshotted here (like the run values) so the
    // client and server evaluate the trigger identically.
    let eventConfig = form.config;
    if (form.eventType === "deadline-passed") {
      const scope = workflowDef?.scope ?? {};
      const scopeCourse = (scope.lmsCourse ?? "").trim();
      const singleCourse =
        scopeCourse && scopeCourse !== "*" && !scopeCourse.includes("\n") ? scopeCourse : "";
      const scopeInst = (scope.institution ?? "").trim();
      const singleInst = scopeInst && scopeInst !== "*" ? scopeInst : "";
      eventConfig = {
        ...form.config,
        course: (form.config.course ?? "").trim() || singleCourse,
        institution:
          (form.config.institution ?? "").trim() || singleInst || (form.institution ?? ""),
      };
      if (!eventConfig.course.trim()) {
        return {
          ok: false,
          error: "Set the course here, or set what this workflow is for (a single Canvas course) under Build.",
        };
      }
    }
    return { ok: true, eventConfig };
  };

  // Create an event trigger for the selected workflow from the current form
  // values. Mirrors handleCreateSchedule's snapshot of values/provider/
  // disabledSteps; the event source and its config decide when it fires.
  // Attempt to register a webhook for repo-push triggers if org is configured.
  const maybeRegisterRepoPushWebhook = (form: typeof triggerForm) => {
    if (!form || form.eventType !== "repo-push") return;
    const hookOrg = (form.config.org ?? "").trim();
    if (!hookOrg) return;
    void registerOrgPushWebhookAction(hookOrg)
      .then((res) => {
        setWebhookSetup(
          res.ok
            ? { ok: true, org: hookOrg, url: res.url, alreadyExisted: res.alreadyExisted }
            : { ok: false, org: hookOrg, url: res.url, error: res.error }
        );
      })
      .catch(() => {
        /* best-effort: the ~15-min poller still fires the trigger */
      });
  };

  const handleCreateTrigger = async () => {
    if (!user || !selectedDef || !triggerForm) return;
    const validation = validateTriggerForm(triggerForm, selectedDef);
    if (!validation.ok) {
      setTriggerError(validation.error);
      return;
    }
    const { eventConfig } = validation;
    const source = getEventSource(triggerForm.eventType);
    if (!source) {
      setTriggerError("Pick an event.");
      return;
    }
    setTriggerBusy(true);
    setTriggerError(null);
    try {
      const created = await createWorkflowTrigger(supabase, user.id, {
        workflowId: selectedDef.id,
        workflowName: selectedDef.name,
        fieldValues: values,
        eventType: triggerForm.eventType,
        eventConfig,
        // Only meaningful when selectedHeadlessSafe gated the checkbox visible
        // AND the event source can be evaluated server-side; app-open triggers
        // ignore it. provider/disabledSteps are snapshotted regardless.
        unattended: selectedHeadlessSafe && source.serverEvaluable && triggerForm.unattended,
        provider: getStoredProvider(),
        disabledSteps: Array.from(disabledSteps),
        courseId: triggerForm.courseId || null,
        institution: triggerForm.institution || null,
        webhookToken: triggerForm.eventType === "webhook" ? generateWebhookToken() : null,
      });
      setTriggers((prev) => [created, ...(prev ?? [])]);
      maybeRegisterRepoPushWebhook(triggerForm);
      setTriggerForm(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not save the trigger.");
    } finally {
      setTriggerBusy(false);
    }
  };

  // Save changes to an existing trigger.
  const handleSaveEditTrigger = async (triggerId: string) => {
    if (!user || !triggerForm) return;
    const editingTrigger = triggers?.find((t) => t.id === triggerId);
    if (!editingTrigger) return;
    const validation = validateTriggerForm(triggerForm, selectedDef);
    if (!validation.ok) {
      setTriggerError(validation.error);
      return;
    }
    const { eventConfig } = validation;
    const source = getEventSource(triggerForm.eventType);
    if (!source) {
      setTriggerError("Pick an event.");
      return;
    }
    setTriggerBusy(true);
    setTriggerError(null);
    try {
      await updateWorkflowTrigger(supabase, user.id, triggerId, {
        eventType: triggerForm.eventType,
        eventConfig,
        courseId: triggerForm.courseId || null,
        institution: triggerForm.institution || null,
        unattended: selectedHeadlessSafe && source.serverEvaluable && triggerForm.unattended,
        cursor: null,
      });
      setTriggers((prev) =>
        (prev ?? []).map((t) =>
          t.id === triggerId
            ? {
                ...t,
                eventType: triggerForm.eventType,
                eventConfig,
                courseId: triggerForm.courseId || null,
                institution: triggerForm.institution || null,
                unattended: selectedHeadlessSafe && source.serverEvaluable && triggerForm.unattended,
                cursor: null,
              }
            : t
        )
      );
      maybeRegisterRepoPushWebhook(triggerForm);
      setTriggerForm(null);
      setEditingTriggerId(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not save the trigger.");
    } finally {
      setTriggerBusy(false);
    }
  };

  const handleToggleTrigger = async (t: WorkflowTrigger) => {
    if (!user) return;
    try {
      await updateWorkflowTrigger(supabase, user.id, t.id, { enabled: !t.enabled });
      setTriggers((prev) =>
        (prev ?? []).map((x) => (x.id === t.id ? { ...x, enabled: !t.enabled } : x))
      );
      setTriggerError(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not update the trigger.");
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    if (!user) return;
    try {
      await deleteWorkflowTrigger(supabase, user.id, id);
      setTriggers((prev) => (prev ?? []).filter((x) => x.id !== id));
      setTriggerRemoveConfirm(null);
      setTriggerError(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not delete the trigger.");
    }
  };

  // The webhook base URL shown next to a webhook trigger. Read at render on the
  // client so it reflects wherever the app is actually served from.
  const webhookBaseUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className={styles.card}>
      <TabHeader
        eyebrow="Workflows"
        title="Composite actions"
        subtitle="Kick off multi-step jobs that chain the app's tools together: schedules, repos, lecture materials, and LMS population in one run."
      />

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>Workflows</div>
          <TextField
            size="small"
            value={workflowSearch}
            onChange={(e) => setWorkflowSearch(e.target.value)}
            placeholder="Search workflows..."
            aria-label="Search workflows"
            sx={{ marginBottom: 1 }}
          />
          {filteredWorkflows.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={running}
              onClick={() => handleWorkflowChange(w.id)}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 8,
                border: "none",
                cursor: running ? "default" : "pointer",
                background: w.id === selectedWorkflowId ? "var(--field-background)" : "transparent",
                color: "var(--text-primary)",
                fontWeight: w.id === selectedWorkflowId ? 600 : 400,
                fontSize: "0.9em",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {w.name}{w.preset ? " (preset)" : ""}
              </span>
              {(() => {
                const a = automationByWorkflow.get(w.id);
                if (!a || (!a.scheduled && !a.triggered)) return null;
                return (
                  <span className={styles.ghBadges} style={{ flex: "none" }}>
                    {a.scheduled && (
                      <span className={styles.ghDot} style={{ color: "var(--accent)" }} title="Scheduled" aria-label="Scheduled" />
                    )}
                    {a.triggered && (
                      <span className={styles.ghDot} style={{ color: "var(--success)" }} title="Has triggers" aria-label="Has triggers" />
                    )}
                  </span>
                );
              })()}
            </button>
          ))}
          {filteredWorkflows.length === 0 && (
            <div style={{ fontSize: "0.85em", color: "var(--text-secondary)", padding: "4px 8px" }}>
              No workflows match your search.
            </div>
          )}
          <Button
            size="small"
            variant="outlined"
            disabled={running}
            onClick={() => {
              const newDef: WorkflowDef = {
                id: crypto.randomUUID(),
                name: "New workflow",
                description: "",
                steps: [],
              };
              updateCustom([...custom, newDef]);
              if (user && supabase) {
                void upsertWorkflowDef(supabase, user.id, newDef).catch(console.error);
              }
              handleWorkflowChange(newDef.id);
              setEditing(true);
              setPanel("build");
            }}
          >
            New workflow
          </Button>
        </div>

        <div className={styles.form} style={{ flex: 1, minWidth: 320 }}>
          {!selectedDef ? (
            <p className={styles.fieldHint}>Select a workflow from the list, or create a new one.</p>
          ) : (
            <>
              <Tabs
                value={panel}
                onChange={(_, v) => setPanel(v as "build" | "run" | "automate")}
                sx={{ minHeight: 36, mb: 1 }}
              >
                {/* Lock navigation away from an active run so its progress and
                    any mid-run pause / input prompt (which live in the Run
                    panel) can never be hidden behind another tab. */}
                <Tab value="build" label="Build" sx={{ minHeight: 36 }} disabled={running || !!runPause || !!runInput} />
                <Tab value="run" label="Run" sx={{ minHeight: 36 }} />
                <Tab value="automate" label="Automate" sx={{ minHeight: 36 }} disabled={running || !!runPause || !!runInput} />
              </Tabs>

              {panel === "build" && (
                <>
                  {selectedDef && (
                    <>
                      {selectedDef.preset && (
                        <p className={styles.fieldHint} style={{ marginBottom: 4 }}>
                          Setting what this workflow is for saves it as your own editable copy.
                        </p>
                      )}
                      <WorkflowScopeControl
                        scope={selectedDef.scope ?? {}}
                        onChange={selectedDef.preset ? handlePresetScope : handleScopeChange}
                        hubCourses={hubCourses}
                        institutions={institutions}
                        orgs={orgs}
                        lmsCourseOptions={lmsCourseOptions}
                        activeInstitution={activeInstitution || null}
                      />
                    </>
                  )}
                  {selectedDef && (
                    <>
                      <p className={styles.fieldHint}>{selectedDef.description}</p>
                      {expanded.error && (
                        <p className={styles.error}>{expanded.error}</p>
                      )}
                      {!editing && (
                        <div className={styles.fieldHint}>
                          <div style={{ marginBottom: 6 }}>
                            Turn a step off to skip it in your own runs - this only
                            affects you; the workflow itself (and other users) is
                            unchanged.
                          </div>
                          {expanded.steps.map((step, i) => {
                            const stepDef = getStepDefinition(step.type);
                            const topIndex = expanded.topIndices[i];
                            const isDisabled = disabledSteps.has(topIndex);
                            return (
                              <StepOverviewRow
                                key={i}
                                step={step}
                                index={i}
                                disabled={isDisabled}
                                origin={expanded.origins[i] ?? undefined}
                                dependencyWarning={disabledStepsWithEnabledDependents.has(topIndex)}
                                onToggle={() => {
                                  setDisabledSteps((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(topIndex)) next.delete(topIndex);
                                    else next.add(topIndex);
                                    return next;
                                  });
                                }}
                                stepDef={stepDef}
                              />
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={running}
                      onClick={() => {
                        if (!selectedDef) return;
              const copied: WorkflowDef = {
                id: crypto.randomUUID(),
                name: `${selectedDef.name} (copy)`,
                description: selectedDef.description,
                steps: JSON.parse(JSON.stringify(selectedDef.steps)),
                // Carry the workflow-level targets to the copy (a duplicate of a
                // preset is how you customize its scope, so it must inherit it).
                ...(selectedDef.scope ? { scope: { ...selectedDef.scope } } : {}),
              };
              updateCustom([...custom, copied]);
              if (user && supabase) {
                void upsertWorkflowDef(supabase, user.id, copied).catch(console.error);
              }
              handleWorkflowChange(copied.id);
              setEditing(true);
            }}
          >
            Duplicate
          </Button>

          {selectedDef && !selectedDef.preset && (
            <>
              <Button
                size="small"
                variant="outlined"
                disabled={running}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>

              <Button
                size="small"
                variant="outlined"
                disabled={running}
                onClick={() => {
                  if (!deleteArmed) {
                    setDeleteArmed(true);
                  } else {
                    if (user && supabase) {
                      void deleteWorkflowDef(supabase, selectedDef.id).catch(console.error);
                    }
                    updateCustom(custom.filter((w) => w.id !== selectedDef.id));
                    try {
                      localStorage.removeItem(
                        `ta-workflow-values-${selectedDef.id}`
                      );
                    } catch {
                      // Ignore storage failures; the key is best-effort cleanup.
                    }
                    const next = workflows.find((w) => w.id !== selectedDef.id);
                    const newId = next?.id ?? workflows[0]?.id ?? COURSE_KICKOFF.id;
                    handleWorkflowChange(newId);
                  }
                }}
              >
                {deleteArmed ? "Confirm delete" : "Delete"}
              </Button>
            </>
          )}

          {selectedDef?.preset && (
            <p className={styles.fieldHint}>
              Presets are read-only - duplicate one to customize it.
            </p>
          )}
        </div>

        {editing && selectedDef && !selectedDef.preset && (
          <WorkflowBuilder
            def={selectedDef}
            others={workflows.filter((w) => w.id !== selectedDef.id)}
            picker={{ hubCourses, institutions, orgs }}
            onChange={(next) => {
              updateCustom(custom.map((w) => (w.id === next.id ? next : w)));
              if (user && supabase) {
                pendingDefRef.current = next;
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                }
                saveTimerRef.current = setTimeout(() => {
                  if (pendingDefRef.current) {
                    void upsertWorkflowDef(supabase, user.id, pendingDefRef.current).catch(
                      console.error
                    );
                  }
                  pendingDefRef.current = null;
                }, 800);
              }
            }}
            onDone={() => {
              if (user && supabase && saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                if (pendingDefRef.current) {
                  void upsertWorkflowDef(supabase, user.id, pendingDefRef.current).catch(
                    console.error
                  );
                }
                pendingDefRef.current = null;
              }
              setEditing(false);
            }}
          />
        )}
                </>
              )}

              {panel === "run" && (
                <>
                  {describeWorkflowScope(selectedDef.scope) && (
                    <p className={styles.fieldHint} style={{ margin: "0 0 10px 0" }}>
                      This workflow targets {describeWorkflowScope(selectedDef.scope)} (set under Build).
                    </p>
                  )}
                  {isInstitutionFanout(selectedDef.scope) && (
                    <p className={styles.fieldHint} style={{ margin: "0 0 10px 0" }}>
                      Scheduled and unattended runs cover every configured institution; a manual run here uses your active institution.
                    </p>
                  )}
                  {runtimeFields.map((field) => (
                    <RuntimeFieldInput
                      key={field.fieldKey}
                      field={field}
                      value={values[field.fieldKey] ?? ""}
                      onChange={(newValue) => handleValueChange(field.fieldKey, newValue)}
                      options={{
                        orgs,
                        orgsError,
                        hubCourses,
                        hubCoursesError,
                        lmsCourseOptions,
                        lmsCourseOptionsError,
                        lmsModuleOptions,
                        lmsModuleError,
                        lmsModuleFromExport,
                        lmsModuleCanvasUrl,
                        deckTemplates,
                        deckTemplatesError,
                        institutions,
                        activeInstitution,
                      }}
                      uploads={{
                        files: uploadFiles,
                        setFiles: setUploadFiles,
                      }}
                    />
                  ))}

            {validationError && (
              <p className={styles.error}>{validationError}</p>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                variant="contained"
                onClick={handleRun}
                disabled={running || !!runPause || !!runInput || !!expanded.error || allStepsDisabled}
                size="small"
              >
                {running ? "Running..." : "Run"}
              </Button>
              {allStepsDisabled && (
                <span className={styles.fieldHint} style={{ color: "var(--danger)" }}>
                  Enable at least one step.
                </span>
              )}
            </div>

                  {runState.length > 0 && (
                    <div style={{ marginTop: 28 }}>
                      <h2 style={{ fontSize: "1rem", marginBottom: 16 }}>Run Progress</h2>
                      {runState.some((grp) => grp.institution !== null) && (
                        <p className={styles.fieldHint} style={{ margin: "0 0 12px 0" }}>
                          {runState.filter((grp) => grp.steps.every((s) => s.status !== "error")).length}
                          /{runState.length} institutions ok
                        </p>
                      )}
                      {runState.map((group, g) => (
                        <Fragment key={group.institution ?? g}>
                          {group.institution && (
                            <h3 style={{ fontSize: "0.85rem", fontWeight: 600, margin: g === 0 ? "0 0 4px 0" : "20px 0 4px 0", color: "var(--hint-text)" }}>
                              {group.institution}
                            </h3>
                          )}
                          {group.steps.map((state, i) => {
                        const stepDef = getStepDefinition(expanded.steps[i]?.type ?? "");

                        return (
                          <RunStepCard
                            key={i}
                            index={i}
                            stepDef={stepDef}
                            origin={expanded.origins[i] ?? undefined}
                            state={state}
                            summary={state.summary ? <SummaryView summary={state.summary} /> : undefined}
                          >
                            {runPause && runPause.groupIndex === g && runPause.stepIndex === i && (
                              <div style={{ marginTop: 12 }}>
                                <p className={styles.fieldHint}>{runPause.message}</p>
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => {
                                      pauseResolverRef.current?.resolve(true);
                                    }}
                                  >
                                    Continue
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                      pauseResolverRef.current?.resolve(false);
                                    }}
                                  >
                                    Cancel run
                                  </Button>
                                </div>
                              </div>
                            )}

                            {runInput && runInput.groupIndex === g && runInput.stepIndex === i && (
                              <RunInputPrompt
                                runInput={runInput}
                                onSubmit={(value) => {
                                  inputResolverRef.current?.resolve(
                                    value as string | File[] | Array<Record<string, string>>
                                  );
                                }}
                                onSkip={() => {
                                  inputResolverRef.current?.resolve(null);
                                }}
                                tableHasGrade={tableHasGrade}
                                tableGradeIssue={tableGradeIssue}
                                tableGradeBand={tableGradeBand}
                                compareTableValues={compareTableValues}
                                csvCell={csvCell}
                                initialRows={runInputInitialRows}
                                GradeBadge={GradeBadge}
                                DetailSectionsView={DetailSectionsView}
                              />
                            )}
                          </RunStepCard>
                        );
                      })}
                        </Fragment>
                      ))}
                    </div>
                  )}
                </>
              )}

              {panel === "automate" && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--field-border)" }}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "0.95rem" }}>Scheduled & triggered workflows</h3>
              <AutomateOverview
                workflows={workflows}
                automationByWorkflow={automationByWorkflow}
                schedules={schedules}
                triggers={triggers}
                onSelectWorkflow={setSelectedWorkflowId}
              />
            </div>
            <ScheduleSection
              scheduleForm={scheduleForm}
              setScheduleForm={setScheduleForm}
              editingScheduleId={editingScheduleId}
              setEditingScheduleId={setEditingScheduleId}
              schedules={schedules}
              scheduleBusy={scheduleBusy}
              scheduleError={scheduleError}
              setScheduleError={setScheduleError}
              scheduleRemoveConfirm={scheduleRemoveConfirm}
              setScheduleRemoveConfirm={setScheduleRemoveConfirm}
              selectedDef={selectedDef}
              runtimeFields={runtimeFields}
              hubCourses={hubCourses}
              institutions={institutions}
              activeInstitution={activeInstitution}
              user={user}
              expandedError={expanded.error}
              isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
              selectedHeadlessSafe={selectedHeadlessSafe}
              workflows={workflows}
              onCreate={handleCreateSchedule}
              onSaveEdit={handleSaveEditSchedule}
              onToggle={handleToggleSchedule}
              onDelete={handleDeleteSchedule}
            />

            <TriggerSection
              triggerForm={triggerForm}
              setTriggerForm={setTriggerForm}
              editingTriggerId={editingTriggerId}
              setEditingTriggerId={setEditingTriggerId}
              triggers={triggers}
              triggerBusy={triggerBusy}
              triggerError={triggerError}
              setTriggerError={setTriggerError}
              triggerRemoveConfirm={triggerRemoveConfirm}
              setTriggerRemoveConfirm={setTriggerRemoveConfirm}
              selectedDef={selectedDef}
              selectedWorkflowId={selectedWorkflowId}
              hubCourses={hubCourses}
              institutions={institutions}
              activeInstitution={activeInstitution}
              user={user}
              expandedError={expanded.error}
              isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
              selectedHeadlessSafe={selectedHeadlessSafe}
              webhookSetup={webhookSetup}
              setWebhookSetup={setWebhookSetup}
              webhookBaseUrl={webhookBaseUrl}
              orgs={orgs}
              orgsError={orgsError}
              workflows={workflows}
              onCreate={handleCreateTrigger}
              onSaveEdit={handleSaveEditTrigger}
              onToggle={handleToggleTrigger}
              onDelete={handleDeleteTrigger}
            />
          </div>
        )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
