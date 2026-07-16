"use client";

import { useCallback, useEffect, useMemo, useState, useRef, Fragment } from "react";
import { Button, TextField, MenuItem, Autocomplete, FormControlLabel, Checkbox, Tabs, Tab } from "@mui/material";
import TabHeader from "./TabHeader";
import WorkflowBuilder from "./WorkflowBuilder";
import WorkflowScopeControl from "./WorkflowScopeControl";
import GithubRepoPicker from "./GithubRepoPicker";
import CoursePicker from "./CoursePicker";
import Typeahead from "./ui/Typeahead";
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
  computeNextRunAt,
  describeScheduleCadence,
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
  describeTrigger,
  EVENT_SOURCES,
  type WorkflowTrigger,
  type TriggerEventType,
} from "@/lib/workflow-triggers";
import { recordWorkflowRun } from "@/lib/workflow-runs";
import { isScopeableListType, expandScopedValue, ALL_SCOPE, resolveClassRepoRef, resolveClassTileRef } from "@/lib/workflows/scope";
import { isInstitutionFanout, resolveFanoutInstitutions, scopeForInstitution } from "@/lib/workflows/fanout";
import { loadCommonResources } from "@/lib/common-resources";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { listCourseHubAction, appendCourseMaterialFileAction, appendCourseExportFileAction, listMyOrgsAction, listCoursesAction, listCourseContentAction, runSubmissionCodeAction, registerOrgPushWebhookAction } from "@/app/actions";
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
  const [runInputText, setRunInputText] = useState("");
  const [runInputChoice, setRunInputChoice] = useState("");
  const [runInputFiles, setRunInputFiles] = useState<File[]>([]);
  const [runInputRows, setRunInputRows] = useState<Array<Record<string, string>>>([]);
  const [runInputChecked, setRunInputChecked] = useState<boolean[]>([]);
  const [runInputBusy, setRunInputBusy] = useState(false);
  const [runInputError, setRunInputError] = useState<string | null>(null);
  const [runInputDetails, setRunInputDetails] = useState<Record<number, { open: boolean; status: "loading" | "done" | "error"; detail: TableRowDetail | null; error: string; run?: { status: "running" | "done"; result: CodeRunResult | null; error?: string } }>>({});
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
  const tableDisplay = useMemo(() => {
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

  const tableGradeStats = useMemo(() => {
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
  const tableGradeDist = useMemo(() => {
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

  // Selected rows with invalid grades block approval (a typo would otherwise
  // surface only as a silent per-student skip after posting).
  const tableCheckedInvalid = tableHasGrade
    ? runInputRows.filter((row, i) => (runInputChecked[i] ?? true) && tableGradeIssue(row)).length
    : 0;
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

  // Load the user's scheduled runs once per mount.
  useEffect(() => {
    if (!user) {
      setSchedules([]);
      return;
    }
    let cancelled = false;
    (async () => {
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
    if (!user) {
      setTriggers([]);
      return;
    }
    let cancelled = false;
    (async () => {
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
      const fieldTypes = ["text", "longtext", "number", "date", "repo", "lmsCourse", "lmsCourseList", "hubCourse", "org", "orgList", "institution", "hubCourseList", "uploads"];
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
          if (!binding) continue;

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

  // Create a schedule for the selected workflow from the current form values.
  const handleCreateSchedule = async () => {
    if (!user || !selectedDef || !scheduleForm) return;
    const runAt = new Date(scheduleForm.runAt);
    if (Number.isNaN(runAt.getTime())) {
      setScheduleError("Pick a valid first run time.");
      return;
    }
    if (runAt.getTime() <= Date.now()) {
      setScheduleError("Pick a time in the future.");
      return;
    }
    let intervalMinutes: number | null = null;
    if (scheduleForm.repeat === "interval") {
      const raw = Number(scheduleForm.intervalValue);
      if (!Number.isFinite(raw) || raw <= 0) {
        setScheduleError("Enter how often it should repeat.");
        return;
      }
      intervalMinutes = scheduleForm.intervalUnit === "hours" ? Math.round(raw * 60) : Math.round(raw);
      if (intervalMinutes < MIN_INTERVAL_MINUTES) {
        setScheduleError(`The shortest interval is ${MIN_INTERVAL_MINUTES} minutes.`);
        return;
      }
    }
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

  const handleToggleSchedule = async (s: WorkflowSchedule) => {
    if (!user) return;
    // Re-enabling a schedule whose time already passed: repeating ones move to
    // their next future occurrence instead of firing immediately; a one-time
    // schedule in the past cannot be re-armed.
    let nextRunAt: string | undefined;
    if (!s.enabled && new Date(s.nextRunAt).getTime() <= Date.now()) {
      if (s.repeat === "none") {
        setScheduleError("That one-time schedule is in the past - create a new one instead.");
        return;
      }
      nextRunAt = computeNextRunAt(s.nextRunAt, s.repeat, new Date(), s.intervalMinutes) ?? undefined;
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

  // Create an event trigger for the selected workflow from the current form
  // values. Mirrors handleCreateSchedule's snapshot of values/provider/
  // disabledSteps; the event source and its config decide when it fires.
  const handleCreateTrigger = async () => {
    if (!user || !selectedDef || !triggerForm) return;
    const source = getEventSource(triggerForm.eventType);
    if (!source) {
      setTriggerError("Pick an event.");
      return;
    }
    // Every required config field for this event source must be filled.
    for (const field of source.configFields) {
      if (field.required && !(triggerForm.config[field.key] ?? "").trim()) {
        setTriggerError(`${field.label} is required for this event.`);
        return;
      }
    }
    // An lmsCourse value must contain a Canvas course id, or the server-side
    // evaluator's /courses/(\d+)/ parse will silently never match and the
    // trigger will save but never fire.
    for (const field of source.configFields) {
      if (field.type !== "lmsCourse") continue;
      const fieldValue = (triggerForm.config[field.key] ?? "").trim();
      if (fieldValue && !/courses\/\d+/.test(fieldValue)) {
        setTriggerError("Enter the Canvas course URL (it must contain /courses/<id>).");
        return;
      }
    }
    setTriggerBusy(true);
    setTriggerError(null);
    try {
      const created = await createWorkflowTrigger(supabase, user.id, {
        workflowId: selectedDef.id,
        workflowName: selectedDef.name,
        fieldValues: values,
        eventType: triggerForm.eventType,
        eventConfig: triggerForm.config,
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
      setTriggerForm(null);
      if (triggerForm.eventType === "repo-push") {
        const hookOrg = (triggerForm.config.org ?? "").trim();
        if (hookOrg) {
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
        }
      }
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
                  {selectedDef && !selectedDef.preset && (
                    <WorkflowScopeControl
                      scope={selectedDef.scope ?? {}}
                      onChange={handleScopeChange}
                      hubCourses={hubCourses}
                      institutions={institutions}
                      orgs={orgs}
                      lmsCourseOptions={lmsCourseOptions}
                      activeInstitution={activeInstitution || null}
                    />
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
                            const bindings = Object.entries(step.bindings)
                              .map(([key, binding]) => {
                                if (binding.source === "runtime") {
                                  return `${key}: from run form`;
                                } else if (binding.source === "step") {
                                  return `${key}: from step ${binding.stepIndex + 1} output`;
                                } else if (binding.source === "literal") {
                                  return `${key}: = ${binding.value}`;
                                }
                                return "";
                              })
                              .filter(Boolean)
                              .join(" | ");
                            return (
                              <div
                                key={i}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 2,
                                  opacity: isDisabled ? 0.6 : 1,
                                }}
                              >
                                <Checkbox
                                  size="small"
                                  checked={!isDisabled}
                                  onChange={() => {
                                    setDisabledSteps((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(topIndex)) next.delete(topIndex);
                                      else next.add(topIndex);
                                      return next;
                                    });
                                  }}
                                  title={
                                    isDisabled
                                      ? "Enable this step for your runs"
                                      : "Disable this step for your runs"
                                  }
                                  style={{ padding: 2, marginTop: -3 }}
                                />
                                <div>
                                  <span style={{ textDecoration: isDisabled ? "line-through" : undefined }}>
                                    {i + 1}. {stepDef?.name ?? step.type}
                                  </span>
                                  {expanded.origins[i] && (
                                    <span style={{ marginLeft: 6, opacity: 0.75 }}>
                                      (from {expanded.origins[i]})
                                    </span>
                                  )}
                                  {bindings && (
                                    <span style={{ marginLeft: 8 }}>({bindings})</span>
                                  )}
                                  {isDisabled && (
                                    <span
                                      className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}
                                      style={{ marginLeft: 8 }}
                                    >
                                      Disabled
                                    </span>
                                  )}
                                  {isDisabled && disabledStepsWithEnabledDependents.has(topIndex) && (
                                    <div style={{ fontSize: "0.9em", opacity: 0.85 }}>
                                      A later enabled step depends on this step&apos;s output and will
                                      be skipped when you run.
                                    </div>
                                  )}
                                </div>
                              </div>
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
                  {runtimeFields.map((field) => {
              const value = values[field.fieldKey] ?? "";

              if (field.type === "org") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <Typeahead
                      options={(orgs ?? []).map((o) => ({ value: o, label: o }))}
                      value={value}
                      onChange={(v) => handleValueChange(field.fieldKey, v)}
                      placeholder={
                        orgs === null
                          ? "Loading organizations..."
                          : "Choose an organization..."
                      }
                      loading={orgs === null}
                      noOptionsText="No organizations"
                    />
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                    {orgsError && <p className={styles.error}>{orgsError}</p>}
                  </div>
                );
              } else if (field.type === "orgList") {
                // "*" = all orgs (expanded at run time); otherwise a
                // newline-joined subset.
                const isAll = value.trim() === ALL_SCOPE;
                const orgArray = isAll
                  ? []
                  : value.split("\n").map((s) => s.trim()).filter(Boolean);
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={isAll}
                          onChange={(e) =>
                            handleValueChange(field.fieldKey, e.target.checked ? ALL_SCOPE : "")
                          }
                        />
                      }
                      label="All organizations"
                    />
                    {!isAll && (
                      <Autocomplete
                        multiple
                        options={orgs ?? []}
                        getOptionLabel={(o) => o}
                        value={orgArray}
                        onChange={(_, newValue) =>
                          handleValueChange(field.fieldKey, newValue.join("\n"))
                        }
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            label={field.label}
                            placeholder={
                              orgs === null ? "Loading organizations..." : "Select organizations..."
                            }
                          />
                        )}
                        loading={orgs === null}
                        noOptionsText="No organizations"
                        disabled={orgs === null}
                      />
                    )}
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                    {orgsError && <p className={styles.error}>{orgsError}</p>}
                  </div>
                );
              } else if (field.type === "longtext") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <TextField
                      multiline
                      minRows={4}
                      fullWidth
                      value={value}
                      onChange={(e) =>
                        handleValueChange(field.fieldKey, e.target.value)
                      }
                      size="small"
                    />
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "text") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <TextField
                      fullWidth
                      value={value}
                      onChange={(e) =>
                        handleValueChange(field.fieldKey, e.target.value)
                      }
                      size="small"
                    />
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "number") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <TextField
                      type="number"
                      fullWidth
                      value={value}
                      onChange={(e) =>
                        handleValueChange(field.fieldKey, e.target.value)
                      }
                      size="small"
                    />
                  </div>
                );
              } else if (field.type === "date") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <TextField
                      type="date"
                      fullWidth
                      value={value}
                      onChange={(e) =>
                        handleValueChange(field.fieldKey, e.target.value)
                      }
                      size="small"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "repo") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <span className={styles.fieldHint}>{field.label}</span>
                    <GithubRepoPicker
                      value={value}
                      onChange={(v) => handleValueChange(field.fieldKey, v)}
                    />
                  </div>
                );
              } else if (field.type === "lmsCourse") {
                if (!activeInstitution) {
                  return (
                    <div key={field.fieldKey} className={styles.field}>
                      <p className={styles.fieldHint}>
                        Pick an institution in the top bar first.
                      </p>
                      {field.help && (
                        <p className={styles.fieldHint} style={{ margin: 0 }}>
                          {field.help}
                        </p>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <span className={styles.fieldHint}>{field.label}</span>
                    <CoursePicker
                      activeInstitution={activeInstitution}
                      courseUrl={value}
                      onSelect={(url) => handleValueChange(field.fieldKey, url)}
                    />
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "hubCourse") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={value}
                      onChange={(e) =>
                        handleValueChange(field.fieldKey, e.target.value)
                      }
                    >
                      {/* MUI Select rejects Fragment children (item clicks never register), so option lists are flat arrays. */}
                      {hubCourses === null ? (
                        <MenuItem disabled>Loading courses...</MenuItem>
                      ) : hubCourses.length > 0 ? (
                        [
                          ...hubCourses.map((course) => (
                            <MenuItem key={course.id} value={course.id}>
                              {course.name}
                            </MenuItem>
                          )),
                          ...(value && !hubCourses.some((c) => c.id === value)
                            ? [
                                <MenuItem key="stale" value={value}>
                                  Previous course (reselect)
                                </MenuItem>,
                              ]
                            : []),
                        ]
                      ) : (
                        <MenuItem disabled>No courses available</MenuItem>
                      )}
                    </TextField>
                    {hubCoursesError && (
                      <p className={styles.error}>{hubCoursesError}</p>
                    )}
                  </div>
                );
              } else if (field.type === "lmsCourseList") {
                if (!activeInstitution) {
                  return (
                    <div key={field.fieldKey} className={styles.field}>
                      <p className={styles.fieldHint}>
                        Pick an institution in the top bar first.
                      </p>
                      {field.help && (
                        <p className={styles.fieldHint} style={{ margin: 0 }}>
                          {field.help}
                        </p>
                      )}
                    </div>
                  );
                }
                const isAll = value.trim() === ALL_SCOPE;
                const urlArray = isAll
                  ? []
                  : value.split("\n").map((s) => s.trim()).filter(Boolean);
                const selectedOptions = urlArray.map((url) => {
                  const found = lmsCourseOptions?.find((o) => o.url === url);
                  return found || { url, name: url };
                });
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={isAll}
                          onChange={(e) =>
                            handleValueChange(field.fieldKey, e.target.checked ? ALL_SCOPE : "")
                          }
                        />
                      }
                      label="All courses at this institution"
                    />
                    {!isAll && (
                      <Autocomplete
                        multiple
                        options={lmsCourseOptions ?? []}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, val) => option.url === val.url}
                        value={selectedOptions}
                        onChange={(_, newValue) => {
                          const urls = newValue.map((o) => o.url).join("\n");
                          handleValueChange(field.fieldKey, urls);
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            label={field.label}
                            placeholder={
                              lmsCourseOptions === null
                                ? "Loading courses..."
                                : "Select courses..."
                            }
                          />
                        )}
                        loading={lmsCourseOptions === null}
                        noOptionsText="No courses found"
                        disabled={lmsCourseOptions === null}
                      />
                    )}
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                    {lmsCourseOptionsError && (
                      <p className={styles.error}>{lmsCourseOptionsError}</p>
                    )}
                  </div>
                );
              } else if (field.type === "boolean") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={value === "1"}
                          onChange={(e) =>
                            handleValueChange(field.fieldKey, e.target.checked ? "1" : "")
                          }
                        />
                      }
                      label={field.label}
                    />
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "institution") {
                // Empty values seed from the active institution in a
                // top-level effect; the renderer is a plain Typeahead.
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <Typeahead
                      options={institutions.map((code) => ({
                        value: code,
                        label: code,
                      }))}
                      value={value}
                      onChange={(v) => handleValueChange(field.fieldKey, v)}
                      placeholder="Choose an institution..."
                      noOptionsText="No institutions available"
                    />
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "hubCourseList") {
                // "*" = all tiles (expanded at run time); otherwise a
                // newline-joined subset.
                const isAll = value.trim() === ALL_SCOPE;
                const idArray = isAll
                  ? []
                  : value.split("\n").map((s) => s.trim()).filter(Boolean);
                // Unknown saved ids surface as placeholder options shaped
                // like the hubCourses elements so no cast is needed.
                const selectedOptions = idArray.map((id) => {
                  const found = hubCourses?.find((c) => c.id === id);
                  return (
                    found ?? { id, name: id, canvasUrl: null, repos: [] as string[] }
                  );
                });
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={isAll}
                          onChange={(e) =>
                            handleValueChange(field.fieldKey, e.target.checked ? ALL_SCOPE : "")
                          }
                        />
                      }
                      label="All course tiles"
                    />
                    {!isAll && (
                      <Autocomplete
                        multiple
                        options={hubCourses ?? []}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, val) => option.id === val.id}
                        value={selectedOptions}
                        onChange={(_, newValue) => {
                          const ids = newValue.map((o) => o.id).join("\n");
                          handleValueChange(field.fieldKey, ids);
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            label={field.label}
                            placeholder={
                              hubCourses === null
                                ? "Loading courses..."
                                : "Select courses..."
                            }
                          />
                        )}
                        loading={hubCourses === null}
                        noOptionsText="No courses available"
                        disabled={hubCourses === null}
                      />
                    )}
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                    {hubCoursesError && (
                      <p className={styles.error}>{hubCoursesError}</p>
                    )}
                  </div>
                );
              } else if (field.type === "uploads") {
                const files = uploadFiles[field.fieldKey] ?? [];
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.multiple = true;
                        input.accept = field.accept ?? ".imscc,.zip";
                        input.onchange = (e) => {
                          const newFiles = Array.from((e.target as HTMLInputElement).files ?? []);
                          setUploadFiles((prev) => ({
                            ...prev,
                            [field.fieldKey]: newFiles,
                          }));
                        };
                        input.click();
                      }}
                    >
                      Upload files
                    </Button>
                    {files.length > 0 && (
                      <ul className={styles.fieldHint} style={{ margin: "8px 0 0 16px" }}>
                        {files.map((f, idx) => (
                          <li
                            key={idx}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {f.name}
                            <button
                              className={styles.linkButton}
                              onClick={() => {
                                setUploadFiles((prev) => ({
                                  ...prev,
                                  [field.fieldKey]: prev[field.fieldKey]?.filter(
                                    (_, i) => i !== idx
                                  ) ?? [],
                                }));
                              }}
                              style={{ padding: 0, marginLeft: 4 }}
                            >
                              x
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "lmsModule") {
                // Options load in a top-level effect keyed to the form's
                // first hubCourse field; the renderer reads hoisted state.
                // Without a live LMS connection the options come from the
                // course's LMS export tile.
                // Legacy persisted values are bare live ids; map them onto the
                // matching "id|name" option so the picker still displays them.
                const moduleValue =
                  value && !value.includes("|")
                    ? lmsModuleOptions.find((o) => o.value.startsWith(`${value}|`))?.value ?? value
                    : value;
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    <Typeahead
                      options={lmsModuleOptions}
                      value={moduleValue}
                      onChange={(v) => handleValueChange(field.fieldKey, v)}
                      placeholder="Choose a module..."
                      noOptionsText={
                        lmsModuleError
                          ? `Error: ${lmsModuleError}`
                          : lmsModuleCanvasUrl
                            ? "No modules available"
                            : "No modules available - add a Canvas URL or upload an LMS export to the course tile"
                      }
                    />
                    {lmsModuleFromExport && (
                      <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
                        {lmsModuleCanvasUrl
                          ? "The live LMS is unavailable - these modules come from the course's LMS export."
                          : "No live LMS connection - these modules come from the course's LMS export."}
                      </p>
                    )}
                    {field.help && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                );
              } else if (field.type === "courseList") {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <p className={styles.fieldHint}>
                      {field.label}: this input can only come from a previous step.
                    </p>
                  </div>
                );
              } else {
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <p className={styles.fieldHint}>
                      {field.label}: this input can only come from a previous step.
                    </p>
                  </div>
                );
              }
            })}

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

                        const badgeClass =
                          state.status === "pending"
                            ? styles.ghBadgeNeutral
                            : state.status === "running"
                              ? styles.ghBadgeAccent
                              : state.status === "done"
                                ? styles.ghBadgeSuccess
                                : state.status === "disabled"
                                  ? styles.ghBadgeNeutral
                                  : state.status === "skipped"
                                    ? styles.ghBadgeNeutral
                                    : "";

                        return (
                          <div
                            key={i}
                            style={{
                              border: "1px solid var(--field-border)",
                              borderRadius: 12,
                              padding: 12,
                              marginTop: 8,
                              background: "var(--field-background)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 8,
                              }}
                            >
                              <span>
                                {i + 1}. {stepDef?.name ?? expanded.steps[i]?.type}
                                {expanded.origins[i] && (
                                  <span style={{ marginLeft: 6, opacity: 0.75 }}>
                                    (from {expanded.origins[i]})
                                  </span>
                                )}
                              </span>
                              <span
                                className={`${styles.ghBadge} ${badgeClass}`}
                                style={
                                  state.status === "error"
                                    ? {
                                        color: "var(--danger)",
                                        background: "color-mix(in srgb, var(--danger) 15%, transparent)",
                                      }
                                    : {}
                                }
                              >
                                {state.status === "error"
                                  ? "Failed"
                                  : state.status === "disabled"
                                    ? "Disabled"
                                    : state.status === "skipped"
                                      ? "Skipped"
                                      : state.status}
                              </span>
                            </div>

                            {state.progress && (
                              <p className={styles.fieldHint}>{state.progress}</p>
                            )}

                            {state.error && (
                              <p className={styles.error}>{state.error}</p>
                            )}

                            {state.summary && (
                              <div style={{ marginTop: 12 }}>
                                <SummaryView summary={state.summary} />
                              </div>
                            )}

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
                              <div style={{ marginTop: 12 }}>
                                <p className={styles.fieldHint}>{runInput.message}</p>

                                {runInput.kind === "text" && (
                                  <>
                                    <TextField
                                      size="small"
                                      fullWidth
                                      multiline
                                      minRows={3}
                                      value={runInputText}
                                      onChange={(e) => setRunInputText(e.target.value)}
                                      disabled={runInputBusy}
                                      style={{ marginTop: 8 }}
                                    />
                                    {runInput.regenerate && (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        disabled={runInputBusy}
                                        onClick={async () => {
                                          setRunInputBusy(true);
                                          setRunInputError(null);
                                          try {
                                            const result = await runInput.regenerate!();
                                            setRunInputText(result);
                                          } catch (err) {
                                            setRunInputError(
                                              err instanceof Error ? err.message : "Regeneration failed"
                                            );
                                          } finally {
                                            setRunInputBusy(false);
                                          }
                                        }}
                                        style={{ marginTop: 8 }}
                                      >
                                        Regenerate with AI
                                      </Button>
                                    )}
                                    {runInputError && (
                                      <p className={styles.error} style={{ marginTop: 8 }}>
                                        {runInputError}
                                      </p>
                                    )}
                                  </>
                                )}

                                {(runInput.kind === "choice" || runInput.kind === "workflow") && (
                                  <TextField
                                    size="small"
                                    fullWidth
                                    select
                                    value={runInputChoice}
                                    onChange={(e) => setRunInputChoice(e.target.value)}
                                    style={{ marginTop: 8 }}
                                  >
                                    <MenuItem value="" disabled>
                                      Choose...
                                    </MenuItem>
                                    {runInput.options.map((opt) => (
                                      <MenuItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                )}

                                {runInput.kind === "upload" && (
                                  <>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => {
                                        const input = document.createElement("input");
                                        input.type = "file";
                                        input.multiple = true;
                                        input.accept = ".zip";
                                        input.onchange = (e) => {
                                          const newFiles = Array.from(
                                            (e.target as HTMLInputElement).files ?? []
                                          );
                                          setRunInputFiles(newFiles);
                                        };
                                        input.click();
                                      }}
                                      style={{ marginTop: 8 }}
                                    >
                                      Choose zip...
                                    </Button>
                                    {runInputFiles.length > 0 && (
                                      <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
                                        {runInputFiles.map((f) => f.name).join(", ")}
                                      </p>
                                    )}
                                  </>
                                )}

                                {runInput.kind === "table" && runInput.columns && (
                                  <>
                                    <h3 className={styles.workflowReviewHeading}>
                                      {tableHasGrade ? "Grade review" : "Review table"}
                                    </h3>
                                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                                      <TextField
                                        size="small"
                                        placeholder="Search rows..."
                                        value={runInputSearch}
                                        onChange={(e) => setRunInputSearch(e.target.value)}
                                        sx={{ width: 220 }}
                                      />
                                      {tableGradeStats && (
                                        <span style={{ fontSize: "0.8rem", color: "var(--hint-text)" }}>
                                          {tableGradeStats.avg !== null
                                            ? `avg ${tableGradeStats.avg.toFixed(1)} - median ${tableGradeStats.median!.toFixed(1)} - min ${tableGradeStats.min} - max ${tableGradeStats.max}`
                                            : "no valid grades yet"}
                                          {tableGradeStats.missing > 0 && ` - ${tableGradeStats.missing} without a grade (comment-only)`}
                                          {tableGradeStats.invalid > 0 && (
                                            <span style={{ color: "var(--danger)" }}>
                                              {` - ${tableGradeStats.invalid} invalid grade(s)`}
                                            </span>
                                          )}
                                        </span>
                                      )}
                                      {tableGradeDist && (
                                        <div
                                          role="img"
                                          aria-label={`Grade distribution - ${tableGradeDist.ariaLabel}`}
                                          title={tableGradeDist.ariaLabel}
                                          style={{
                                            display: "flex",
                                            height: 8,
                                            width: 140,
                                            borderRadius: 999,
                                            overflow: "hidden",
                                            background: "var(--surface-subtle)",
                                            flex: "none",
                                          }}
                                        >
                                          {tableGradeDist.segments
                                            .filter((s) => s.count > 0)
                                            .map((s) => (
                                              <div
                                                key={s.band}
                                                style={{
                                                  width: `${(s.count / tableGradeDist.total) * 100}%`,
                                                  background: `var(--${s.band})`,
                                                }}
                                              />
                                            ))}
                                        </div>
                                      )}
                                      <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                                        {tableHasGrade && tableGradeStats && tableGradeStats.invalid > 0 && runInput.selectable && (
                                          <button
                                            type="button"
                                            className={styles.linkButton}
                                            onClick={() =>
                                              setRunInputChecked((prev) =>
                                                prev.map((c, i) => (tableGradeIssue(runInputRows[i] ?? {}) ? false : c))
                                              )
                                            }
                                          >
                                            Uncheck invalid
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className={styles.linkButton}
                                          onClick={() => {
                                            const cols = (runInput.columns ?? []).filter((c) => !c.link);
                                            const header = [...cols.map((c) => c.label), ...(runInput.selectable ? ["Selected"] : [])];
                                            const lines = [header.map(csvCell).join(",")];
                                            for (const { row, index } of tableDisplay) {
                                              lines.push(
                                                [
                                                  ...cols.map((c) => csvCell(row[c.key] ?? "")),
                                                  ...(runInput.selectable ? [(runInputChecked[index] ?? true) ? "yes" : "no"] : []),
                                                ].join(",")
                                              );
                                            }
                                            const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement("a");
                                            a.href = url;
                                            a.download = "review-table.csv";
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                          }}
                                        >
                                          Download CSV
                                        </button>
                                      </span>
                                    </div>
                                    {runInputSearch.trim() && (
                                      <p className={styles.fieldHint} style={{ margin: "6px 0 0 0" }}>
                                        Showing {tableDisplay.length} of {runInputRows.length} row(s); selection actions and the CSV export cover only the visible rows.
                                      </p>
                                    )}
                                  <div style={{ maxHeight: "min(65vh, 720px)", overflow: "auto", marginTop: 8 }}>
                                    <table
                                      style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        fontSize: "0.85rem",
                                      }}
                                    >
                                      <thead>
                                        <tr>
                                          {runInput.selectable && (
                                            <th
                                              style={{
                                                textAlign: "center",
                                                borderBottom: "1px solid var(--field-border)",
                                                padding: "8px 10px",
                                                fontWeight: "bold",
                                                width: 32,
                                                position: "sticky",
                                                top: 0,
                                                background: "var(--card-background)",
                                                zIndex: 1,
                                              }}
                                            >
                                              <Checkbox
                                                size="small"
                                                checked={tableDisplay.length > 0 && tableDisplay.every(({ index }) => runInputChecked[index] ?? true)}
                                                indeterminate={
                                                  tableDisplay.some(({ index }) => runInputChecked[index] ?? true) &&
                                                  !tableDisplay.every(({ index }) => runInputChecked[index] ?? true)
                                                }
                                                onChange={() => {
                                                  const allChecked = tableDisplay.every(({ index }) => runInputChecked[index] ?? true);
                                                  const visible = new Set(tableDisplay.map(({ index }) => index));
                                                  setRunInputChecked((prev) => prev.map((c, i) => (visible.has(i) ? !allChecked : c)));
                                                }}
                                              />
                                            </th>
                                          )}
                                          {runInput.columns.map((col) => (
                                            <th
                                              key={col.key}
                                              style={{
                                                textAlign: "left",
                                                borderBottom: "1px solid var(--field-border)",
                                                padding: "8px 10px",
                                                fontWeight: "bold",
                                                width: col.width,
                                                position: "sticky",
                                                top: 0,
                                                background: "var(--card-background)",
                                                zIndex: 1,
                                                cursor: col.link ? undefined : "pointer",
                                                userSelect: "none",
                                              }}
                                              title={col.link ? undefined : "Sort by this column"}
                                              onClick={() => {
                                                if (col.link) return;
                                                setRunInputSort((prev) =>
                                                  prev?.key !== col.key
                                                    ? { key: col.key, dir: "asc" }
                                                    : prev.dir === "asc"
                                                      ? { key: col.key, dir: "desc" }
                                                      : null
                                                );
                                              }}
                                            >
                                              {col.label}
                                              {runInputSort?.key === col.key && (
                                                <span style={{ marginLeft: 4, fontSize: "0.7em", color: "var(--hint-text)" }}>
                                                  {runInputSort.dir === "asc" ? "(asc)" : "(desc)"}
                                                </span>
                                              )}
                                            </th>
                                          ))}
                                          {runInput.rowDetail && (
                                            <th
                                              style={{
                                                textAlign: "center",
                                                borderBottom: "1px solid var(--field-border)",
                                                padding: "8px 10px",
                                                fontWeight: "bold",
                                                width: 80,
                                                position: "sticky",
                                                top: 0,
                                                background: "var(--card-background)",
                                                zIndex: 1,
                                              }}
                                            >
                                            </th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tableDisplay.map(({ row, index: rowIndex }) => {
                                          const detail = runInputDetails[rowIndex];
                                          const hasDetail = runInput.rowDetail !== undefined;
                                          const colSpan = (runInput.selectable ? 1 : 0) + (runInput.columns?.length ?? 0) + (hasDetail ? 1 : 0);
                                          const initialRow = runInputInitialRows[rowIndex];
                                          const rowDirty =
                                            initialRow !== undefined &&
                                            (runInput.columns ?? []).some(
                                              (c) => c.editable && (row[c.key] ?? "") !== (initialRow[c.key] ?? "")
                                            );
                                          const rowSelected = runInputChecked[rowIndex] ?? true;
                                          return (
                                            <Fragment key={rowIndex}>
                                              <tr
                                                className={`${styles.workflowTableRow} ${
                                                  runInput.selectable
                                                    ? rowSelected
                                                      ? styles.workflowTableRowSelected
                                                      : styles.workflowTableRowUnselected
                                                    : ""
                                                }`}
                                              >
                                                {runInput.selectable && (
                                                  <td
                                                    style={{
                                                      borderBottom: "1px solid var(--field-border)",
                                                      padding: "8px 10px",
                                                      textAlign: "center",
                                                    }}
                                                  >
                                                    <Checkbox
                                                      size="small"
                                                      checked={runInputChecked[rowIndex] ?? true}
                                                      onChange={() => {
                                                        setRunInputChecked((prev) =>
                                                          prev.map((c, idx) =>
                                                            idx === rowIndex ? !c : c
                                                          )
                                                        );
                                                      }}
                                                    />
                                                  </td>
                                                )}
                                                {runInput.columns!.map((col) => (
                                                  <td
                                                    key={col.key}
                                                    style={{
                                                      borderBottom: "1px solid var(--field-border)",
                                                      padding: "8px 10px",
                                                      width: col.width,
                                                    }}
                                                  >
                                                    {col.link ? (
                                                      row[col.key] ? (
                                                        <a href={row[col.key]} target="_blank" rel="noreferrer" className={styles.linkButton}>
                                                          View
                                                        </a>
                                                      ) : null
                                                    ) : col.editable ? (
                                                      <TextField
                                                        size="small"
                                                        fullWidth
                                                        multiline={col.multiline}
                                                        minRows={col.multiline ? 2 : 1}
                                                        value={row[col.key] ?? ""}
                                                        error={tableHasGrade && col.key === "grade" && tableGradeIssue(row) !== null}
                                                        sx={
                                                          initialRow !== undefined && (row[col.key] ?? "") !== (initialRow[col.key] ?? "")
                                                            ? { "& .MuiInputBase-root": { background: "color-mix(in srgb, var(--accent) 8%, transparent)" } }
                                                            : undefined
                                                        }
                                                        onFocus={() =>
                                                          setTableFrozenOrder((prev) => prev ?? tableDisplay.map(({ index }) => index))
                                                        }
                                                        onBlur={() => setTableFrozenOrder(null)}
                                                        onChange={(e) => {
                                                          setRunInputRows((prev) =>
                                                            prev.map((r, idx) =>
                                                              idx === rowIndex
                                                                ? { ...r, [col.key]: e.target.value }
                                                                : r
                                                            )
                                                          );
                                                        }}
                                                      />
                                                    ) : (
                                                      row[col.key] ?? ""
                                                    )}
                                                    {tableHasGrade && col.key === "grade" && (
                                                      <div style={{ marginTop: 4 }}>
                                                        <GradeBadge row={row} />
                                                      </div>
                                                    )}
                                                  </td>
                                                ))}
                                                {hasDetail && (
                                                  <td
                                                    style={{
                                                      borderBottom: "1px solid var(--field-border)",
                                                      padding: "8px 10px",
                                                      textAlign: "center",
                                                      whiteSpace: "nowrap",
                                                    }}
                                                  >
                                                    {rowDirty && (
                                                      <button
                                                        className={styles.linkButton}
                                                        style={{ marginRight: 8 }}
                                                        title="Restore this row's original values"
                                                        onClick={() => {
                                                          setRunInputRows((prev) =>
                                                            prev.map((r, idx) => (idx === rowIndex ? { ...runInputInitialRows[rowIndex] } : r))
                                                          );
                                                        }}
                                                      >
                                                        Reset
                                                      </button>
                                                    )}
                                                    <button
                                                      className={styles.linkButton}
                                                      onClick={async () => {
                                                        if (detail?.open) {
                                                          setRunInputDetails((prev) => ({
                                                            ...prev,
                                                            [rowIndex]: { ...prev[rowIndex]!, open: false },
                                                          }));
                                                        } else if (detail?.status === "done") {
                                                          setRunInputDetails((prev) => ({
                                                            ...prev,
                                                            [rowIndex]: { ...prev[rowIndex]!, open: true },
                                                          }));
                                                        } else {
                                                          setRunInputDetails((prev) => ({
                                                            ...prev,
                                                            [rowIndex]: { open: true, status: "loading", detail: null, error: "" },
                                                          }));
                                                          try {
                                                            const result = await runInput.rowDetail!(row);
                                                            setRunInputDetails((prev) => ({
                                                              ...prev,
                                                              [rowIndex]: { open: true, status: "done", detail: result, error: "" },
                                                            }));
                                                          } catch (err) {
                                                            setRunInputDetails((prev) => ({
                                                              ...prev,
                                                              [rowIndex]: {
                                                                open: true,
                                                                status: "error",
                                                                detail: null,
                                                                error: err instanceof Error ? err.message : "Error loading submission",
                                                              },
                                                            }));
                                                          }
                                                        }
                                                      }}
                                                    >
                                                      {detail?.open ? "Hide" : "Preview"}
                                                    </button>
                                                  </td>
                                                )}
                                              </tr>
                                              {hasDetail && detail?.open && (
                                                <tr>
                                                  <td
                                                    colSpan={colSpan}
                                                    className={styles.workflowDetailCell}
                                                    style={{
                                                      borderBottom: "1px solid var(--field-border)",
                                                      padding: "10px 12px 10px 20px",
                                                    }}
                                                  >
                                                    {detail.status === "loading" && <div>Loading submission...</div>}
                                                    {detail.status === "error" && (
                                                      <div style={{ color: "var(--danger)" }}>{detail.error}</div>
                                                    )}
                                                    {detail.status === "done" && detail.detail && (
                                                      <div>
                                                        <div
                                                          style={{
                                                            maxHeight: 300,
                                                            overflow: "auto",
                                                            fontSize: "0.85rem",
                                                            padding: "10px 12px",
                                                            background: "var(--card-background)",
                                                            border: "1px solid var(--field-border)",
                                                            borderRadius: "6px",
                                                            marginBottom: "12px",
                                                          }}
                                                        >
                                                          <DetailSectionsView text={detail.detail.text} />
                                                        </div>
                                                        {detail.detail.files && detail.detail.files.length > 0 && (
                                                          <div>
                                                            {detail.detail.files.map((file) => {
                                                              const isTextLike = file.mimeType.startsWith("text/") ||
                                                                ["py", "js", "ts", "jsx", "tsx", "java", "c", "cpp", "h", "cs", "rb", "go", "rs", "php", "html", "css", "json", "md", "txt", "sql", "sh", "yml", "yaml"].includes(
                                                                  file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "" : ""
                                                                );
                                                              const content = isTextLike
                                                                ? (() => {
                                                                    try {
                                                                      const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
                                                                      const text = new TextDecoder().decode(bytes);
                                                                      return text.length > 20000 ? text.substring(0, 20000) + "\n... (truncated)" : text;
                                                                    } catch {
                                                                      return "(Error decoding file)";
                                                                    }
                                                                  })()
                                                                : "(binary file - download via SpeedGrader)";
                                                              return (
                                                                <div key={file.name} className={styles.workflowCard} style={{ marginTop: "8px" }}>
                                                                  <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{file.name}</div>
                                                                  <pre
                                                                    style={{
                                                                      fontFamily: "monospace",
                                                                      fontSize: "0.8rem",
                                                                      whiteSpace: "pre-wrap",
                                                                      margin: 0,
                                                                      maxHeight: 240,
                                                                      overflow: "auto",
                                                                    }}
                                                                  >
                                                                    {content}
                                                                  </pre>
                                                                </div>
                                                              );
                                                            })}
                                                            <Button
                                                              size="small"
                                                              variant="outlined"
                                                              disabled={detail.run?.status === "running"}
                                                              onClick={async () => {
                                                                setRunInputDetails((prev) => ({
                                                                  ...prev,
                                                                  [rowIndex]: {
                                                                    ...prev[rowIndex]!,
                                                                    run: { status: "running", result: null },
                                                                  },
                                                                }));
                                                                try {
                                                                  const result = await runSubmissionCodeAction(
                                                                    (detail.detail?.files ?? []).map((f) => ({
                                                                      name: f.name,
                                                                      extension: f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "",
                                                                      rawBase64: f.base64,
                                                                    }))
                                                                  );
                                                                  setRunInputDetails((prev) => ({
                                                                    ...prev,
                                                                    [rowIndex]: {
                                                                      ...prev[rowIndex]!,
                                                                      run: { status: "done", result },
                                                                    },
                                                                  }));
                                                                } catch (err) {
                                                                  setRunInputDetails((prev) => ({
                                                                    ...prev,
                                                                    [rowIndex]: {
                                                                      ...prev[rowIndex]!,
                                                                      run: {
                                                                        status: "done",
                                                                        result: null,
                                                                        error: err instanceof Error ? err.message : "Run failed.",
                                                                      },
                                                                    },
                                                                  }));
                                                                }
                                                              }}
                                                              style={{ marginTop: "8px" }}
                                                            >
                                                              {detail.run?.status === "running" ? "Running..." : detail.run?.result ? "Run again" : "Run code"}
                                                            </Button>
                                                            {detail.run?.result && (
                                                              <div className={styles.workflowCard} style={{ marginTop: "12px" }}>
                                                                <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                                                                  {detail.run.result.language} - {detail.run.result.ran ? `ran (exit ${detail.run.result.exitCode})` : `failed${detail.run.result.exitCode !== null ? ` (exit ${detail.run.result.exitCode})` : ""}`}
                                                                </div>
                                                                {detail.run.result.error && (
                                                                  <div style={{ marginBottom: "8px" }}>
                                                                    <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Error</div>
                                                                    <pre
                                                                      style={{
                                                                        fontFamily: "monospace",
                                                                        fontSize: "0.8rem",
                                                                        whiteSpace: "pre-wrap",
                                                                        margin: "0",
                                                                        maxHeight: 240,
                                                                        overflow: "auto",
                                                                        padding: 8,
                                                                        background: "var(--card-background)",
                                                                        border: "1px solid var(--field-border)",
                                                                        borderRadius: 4,
                                                                      }}
                                                                    >
                                                                      {detail.run.result.error}
                                                                    </pre>
                                                                  </div>
                                                                )}
                                                                {detail.run.result.compileOutput && (
                                                                  <div style={{ marginBottom: "8px" }}>
                                                                    <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Compile output</div>
                                                                    <pre
                                                                      style={{
                                                                        fontFamily: "monospace",
                                                                        fontSize: "0.8rem",
                                                                        whiteSpace: "pre-wrap",
                                                                        margin: "0",
                                                                        maxHeight: 240,
                                                                        overflow: "auto",
                                                                        padding: 8,
                                                                        background: "var(--card-background)",
                                                                        border: "1px solid var(--field-border)",
                                                                        borderRadius: 4,
                                                                      }}
                                                                    >
                                                                      {detail.run.result.compileOutput}
                                                                    </pre>
                                                                  </div>
                                                                )}
                                                                {detail.run.result.stdout && (
                                                                  <div style={{ marginBottom: "8px" }}>
                                                                    <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Output</div>
                                                                    <pre
                                                                      style={{
                                                                        fontFamily: "monospace",
                                                                        fontSize: "0.8rem",
                                                                        whiteSpace: "pre-wrap",
                                                                        margin: "0",
                                                                        maxHeight: 240,
                                                                        overflow: "auto",
                                                                        padding: 8,
                                                                        background: "var(--card-background)",
                                                                        border: "1px solid var(--field-border)",
                                                                        borderRadius: 4,
                                                                      }}
                                                                    >
                                                                      {detail.run.result.stdout}
                                                                    </pre>
                                                                  </div>
                                                                )}
                                                                {detail.run.result.stderr && (
                                                                  <div style={{ marginBottom: "8px" }}>
                                                                    <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Stderr</div>
                                                                    <pre
                                                                      style={{
                                                                        fontFamily: "monospace",
                                                                        fontSize: "0.8rem",
                                                                        whiteSpace: "pre-wrap",
                                                                        margin: "0",
                                                                        maxHeight: 240,
                                                                        overflow: "auto",
                                                                        padding: 8,
                                                                        background: "var(--card-background)",
                                                                        border: "1px solid var(--field-border)",
                                                                        borderRadius: 4,
                                                                      }}
                                                                    >
                                                                      {detail.run.result.stderr}
                                                                    </pre>
                                                                  </div>
                                                                )}
                                                              </div>
                                                            )}
                                                            {detail.run?.result === null && detail.run?.status === "done" && (
                                                              detail.run.error ? (
                                                                <div style={{ marginTop: "12px", color: "var(--danger)", fontSize: "0.85rem" }}>
                                                                  Run failed: {detail.run.error}
                                                                </div>
                                                              ) : (
                                                                <div style={{ marginTop: "12px", color: "var(--hint-text)", fontSize: "0.85rem" }}>
                                                                  No runnable code detected.
                                                                </div>
                                                              )
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    )}
                                                  </td>
                                                </tr>
                                              )}
                                            </Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                  </>
                                )}

                                <div
                                  className={runInput.kind === "table" ? styles.workflowActionBar : undefined}
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    marginTop: 8,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <Button
                                    size="small"
                                    variant="contained"
                                    disabled={
                                      runInputBusy ||
                                      (runInput.kind === "text"
                                        ? !runInputText.trim()
                                        : runInput.kind === "choice" || runInput.kind === "workflow"
                                          ? !runInputChoice
                                          : runInput.kind === "upload"
                                            ? runInputFiles.length === 0
                                            : runInput.kind === "table" && runInput.selectable
                                              ? runInputRows.filter((_, idx) => runInputChecked[idx]).length === 0 ||
                                                tableCheckedInvalid > 0
                                              : runInputRows.length === 0)
                                    }
                                    onClick={() => {
                                      let value: string | File[] | Array<Record<string, string>>;
                                      if (runInput.kind === "text") {
                                        value = runInputText;
                                      } else if (
                                        runInput.kind === "choice" ||
                                        runInput.kind === "workflow"
                                      ) {
                                        value = runInputChoice;
                                      } else if (runInput.kind === "upload") {
                                        value = runInputFiles;
                                      } else if (runInput.kind === "table") {
                                        value = runInput.selectable
                                          ? runInputRows.filter((_, idx) => runInputChecked[idx])
                                          : runInputRows;
                                      } else {
                                        value = runInputRows;
                                      }
                                      inputResolverRef.current?.resolve(
                                        value as string | File[] | Array<Record<string, string>>
                                      );
                                    }}
                                  >
                                    {runInput.kind === "workflow"
                                      ? "Run selected workflow after this run"
                                      : runInput.submitLabel ?? "Submit"}
                                  </Button>
                                  {runInput.optional && (
                                    <Button
                                      size="small"
                                      variant="text"
                                      disabled={runInputBusy}
                                      onClick={() => {
                                        inputResolverRef.current?.resolve(null);
                                      }}
                                    >
                                      Skip
                                    </Button>
                                  )}
                                  {!runInput.optional && (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      disabled={runInputBusy}
                                      onClick={() => {
                                        inputResolverRef.current?.resolve(null);
                                      }}
                                    >
                                      Cancel run
                                    </Button>
                                  )}
                                  {runInput.kind === "table" && runInput.selectable && (
                                    <span style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginLeft: "auto" }}>
                                      {runInputChecked.filter(Boolean).length} of {runInputRows.length} row(s) selected
                                      {tableCheckedInvalid > 0 && (
                                        <span style={{ color: "var(--danger)" }}>
                                          {` - ${tableCheckedInvalid} selected row(s) have an invalid grade; fix them or uncheck them to enable ${runInput.submitLabel ?? "Submit"}`}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
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
              {(() => {
                const automated = workflows.filter((w) => {
                  const a = automationByWorkflow.get(w.id);
                  return a && (a.scheduled || a.triggered);
                });
                if (automated.length === 0) {
                  return <div className={styles.fieldHint}>No workflows are scheduled or have triggers yet.</div>;
                }
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {automated.map((w) => {
                      const wfSchedules = (schedules ?? []).filter((s) => s.workflowId === w.id && s.enabled);
                      const wfTriggers = (triggers ?? []).filter((t) => t.workflowId === w.id && t.enabled);
                      return (
                        <div key={w.id} style={{ borderLeft: "2px solid var(--field-border)", paddingLeft: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{w.name}</div>
                          {wfSchedules.map((s) => (
                            <div key={s.id} className={styles.fieldHint} style={{ margin: 0 }}>
                              Scheduled {describeScheduleCadence(s)}{s.unattended ? " (unattended)" : ""}
                            </div>
                          ))}
                          {wfTriggers.map((t) => (
                            <div key={t.id} className={styles.fieldHint} style={{ margin: 0 }}>
                              Trigger: {describeTrigger(t)}{t.unattended ? " (unattended)" : ""}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <h3 style={{ fontSize: "0.95rem", margin: "0 0 4px 0" }}>Schedule</h3>
            <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
              Run this workflow at a set time, optionally repeating.
            </p>
            <Button
              variant="outlined"
              size="small"
              disabled={!user || !!expanded.error}
              onClick={() =>
                setScheduleForm((prev) =>
                  prev
                    ? null
                    : { runAt: "", repeat: "none", intervalValue: "30", intervalUnit: "minutes", courseId: "", institution: activeInstitution || "", unattended: false }
                )
              }
            >
              {scheduleForm ? "Cancel schedule" : "Schedule..."}
            </Button>

            {scheduleForm && (
              <div style={{ marginTop: 16, border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: "0.9em" }}>Schedule {selectedDef?.name}</span>
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  Uses the run form values as they are right now. Runs start while the app is open; an overdue schedule runs on your next visit.
                </p>
                {runtimeFields.some((f) => f.type === "uploads" && f.required) && (
                  <p className={styles.fieldHint} style={{ margin: 0, color: "var(--danger)" }}>
                    This workflow requires a file upload at run time, which cannot be saved with a schedule - the scheduled run will stop at the form.
                  </p>
                )}
                {scheduleForm.repeat === "interval" && (
                  <p className={styles.fieldHint} style={{ margin: 0 }}>
                    Set any interval from {MIN_INTERVAL_MINUTES} minutes up. Unattended runs are checked about every {MIN_INTERVAL_MINUTES} minutes, so that is the shortest that fires reliably.
                  </p>
                )}
                {selectedHeadlessSafe ? (
                  <div>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={scheduleForm.unattended}
                          onChange={(e) =>
                            setScheduleForm((p) => (p ? { ...p, unattended: e.target.checked } : p))
                          }
                        />
                      }
                      label="Run unattended in the cloud (even when the app is closed)"
                    />
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      Unattended runs use the current run-form values and provider snapshot; interactive workflows are not eligible.
                    </p>
                  </div>
                ) : (
                  <p className={styles.fieldHint} style={{ margin: 0 }}>
                    This workflow pauses for input, so it can only run while the app is open.
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <TextField
                    size="small"
                    label="First run"
                    type="datetime-local"
                    value={scheduleForm.runAt}
                    onChange={(e) => setScheduleForm((p) => (p ? { ...p, runAt: e.target.value } : p))}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Repeat"
                    value={scheduleForm.repeat}
                    onChange={(e) => setScheduleForm((p) => (p ? { ...p, repeat: e.target.value as ScheduleRepeat } : p))}
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="none">Does not repeat</MenuItem>
                    <MenuItem value="interval">Every...</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                  </TextField>
                  {scheduleForm.repeat === "interval" && (
                    <>
                      <TextField
                        size="small"
                        label="Every"
                        type="number"
                        value={scheduleForm.intervalValue}
                        onChange={(e) => setScheduleForm((p) => (p ? { ...p, intervalValue: e.target.value } : p))}
                        slotProps={{ htmlInput: { min: 1, step: 1 } }}
                        sx={{ width: 90 }}
                      />
                      <TextField
                        select
                        size="small"
                        label="Unit"
                        value={scheduleForm.intervalUnit}
                        onChange={(e) => setScheduleForm((p) => (p ? { ...p, intervalUnit: e.target.value as "minutes" | "hours" } : p))}
                        sx={{ minWidth: 110 }}
                      >
                        <MenuItem value="minutes">minutes</MenuItem>
                        <MenuItem value="hours">hours</MenuItem>
                      </TextField>
                    </>
                  )}
                  <TextField
                    select
                    size="small"
                    label="Course (optional)"
                    value={scheduleForm.courseId}
                    onChange={(e) => setScheduleForm((p) => (p ? { ...p, courseId: e.target.value } : p))}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="">None</MenuItem>
                    {(hubCourses ?? []).map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Institution (optional)"
                    value={scheduleForm.institution}
                    onChange={(e) => setScheduleForm((p) => (p ? { ...p, institution: e.target.value } : p))}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="">None</MenuItem>
                    {institutions.map((i) => (
                      <MenuItem key={i} value={i}>{i}</MenuItem>
                    ))}
                  </TextField>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={scheduleBusy || !scheduleForm.runAt}
                    onClick={() => void handleCreateSchedule()}
                  >
                    {scheduleBusy ? "Saving..." : "Save schedule"}
                  </Button>
                </div>
              </div>
            )}

            {scheduleError && <p className={styles.error}>{scheduleError}</p>}

            {schedules && schedules.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: "0.9rem", margin: "0 0 8px 0" }}>Scheduled runs</h3>
                {schedules.map((s) => {
                  const courseName = s.courseId
                    ? hubCourses?.find((c) => c.id === s.courseId)?.name ?? "course"
                    : null;
                  const attachment = [courseName, s.institution].filter(Boolean).join(", ");
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--field-border)", fontSize: "0.85em" }}>
                      <span style={{ fontWeight: 600 }}>{s.workflowName}</span>
                      {s.unattended && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>Unattended</span>
                      )}
                      <span style={{ color: "var(--text-secondary)" }}>
                        {s.enabled
                          ? `next run ${new Date(s.nextRunAt).toLocaleString()} (${describeScheduleCadence(s)})`
                          : "disabled"}
                        {attachment ? ` - ${attachment}` : ""}
                      </span>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        <button type="button" className={styles.linkButton} onClick={() => void handleToggleSchedule(s)}>
                          {s.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ color: "var(--danger)" }}
                          onClick={() =>
                            scheduleRemoveConfirm === s.id
                              ? void handleDeleteSchedule(s.id)
                              : setScheduleRemoveConfirm(s.id)
                          }
                        >
                          {scheduleRemoveConfirm === s.id ? "Confirm" : "Remove"}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <h3 style={{ fontSize: "0.95rem", margin: "24px 0 4px 0", paddingTop: 16, borderTop: "1px solid var(--field-border)" }}>Triggers</h3>
            <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
              Run this workflow automatically when an event happens - a submission, a message, a repo push, another workflow finishing, or an inbound webhook.
            </p>
            <Button
              variant="outlined"
              size="small"
              disabled={!user || !!expanded.error}
              onClick={() =>
                setTriggerForm((prev) =>
                  prev
                    ? null
                    : {
                        eventType: "submission-received",
                        config: {},
                        courseId: "",
                        institution: activeInstitution || "",
                        unattended: false,
                      }
                )
              }
            >
              {triggerForm ? "Cancel trigger" : "Trigger on event..."}
            </Button>

            {triggerForm && (() => {
              const source = getEventSource(triggerForm.eventType);
              const canUnattended = selectedHeadlessSafe && !!source?.serverEvaluable;
              return (
                <div style={{ marginTop: 16, border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9em" }}>Trigger {selectedDef?.name} on an event</span>
                  <p className={styles.fieldHint} style={{ margin: 0 }}>
                    Uses the run form values as they are right now. Events are checked about every {MIN_INTERVAL_MINUTES} minutes while the app is open; unattended triggers are also checked in the cloud.
                  </p>
                  <TextField
                    select
                    size="small"
                    label="Event"
                    value={triggerForm.eventType}
                    onChange={(e) =>
                      setTriggerForm((p) =>
                        p ? { ...p, eventType: e.target.value as TriggerEventType, config: {} } : p
                      )
                    }
                    sx={{ maxWidth: 380 }}
                  >
                    {EVENT_SOURCES.map((s) => (
                      <MenuItem key={s.type} value={s.type}>{s.label}</MenuItem>
                    ))}
                  </TextField>
                  {source && (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>{source.description}</p>
                  )}

                  {(source?.configFields ?? []).map((field) => {
                    const val = triggerForm.config[field.key] ?? "";
                    const setVal = (v: string) =>
                      setTriggerForm((p) => (p ? { ...p, config: { ...p.config, [field.key]: v } } : p));
                    if (field.type === "boolean") {
                      return (
                        <FormControlLabel
                          key={field.key}
                          control={
                            <Checkbox size="small" checked={val === "1"} onChange={(e) => setVal(e.target.checked ? "1" : "")} />
                          }
                          label={field.label}
                        />
                      );
                    }
                    if (field.type === "institution") {
                      return (
                        <TextField key={field.key} select size="small" label={field.label} value={val} onChange={(e) => setVal(e.target.value)} helperText={field.help} sx={{ minWidth: 200 }}>
                          <MenuItem value="">{`(active: ${activeInstitution || "none"})`}</MenuItem>
                          {institutions.map((i) => (
                            <MenuItem key={i} value={i}>{i}</MenuItem>
                          ))}
                        </TextField>
                      );
                    }
                    if (field.type === "institutions") {
                      // "*" means every configured institution (resolved on the
                      // server at evaluation time); otherwise a comma-separated
                      // explicit list; empty falls back to the active one.
                      const all = val.trim() === "*";
                      const selected = all
                        ? []
                        : val.split(",").map((s) => s.trim()).filter(Boolean);
                      return (
                        <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 300 }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={all}
                                onChange={(e) => setVal(e.target.checked ? "*" : "")}
                              />
                            }
                            label="All institutions"
                          />
                          {!all && (
                            <Autocomplete
                              multiple
                              size="small"
                              options={institutions}
                              getOptionLabel={(o) => o}
                              value={selected}
                              onChange={(_, v) => setVal(v.join(","))}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label={field.label}
                                  placeholder={
                                    selected.length ? "" : `active: ${activeInstitution || "none"}`
                                  }
                                />
                              )}
                            />
                          )}
                          {field.help && (
                            <p className={styles.fieldHint} style={{ margin: 0 }}>{field.help}</p>
                          )}
                        </div>
                      );
                    }
                    if (field.type === "course") {
                      return (
                        <TextField key={field.key} select size="small" label={field.label} value={val} onChange={(e) => setVal(e.target.value)} helperText={field.help} sx={{ minWidth: 220 }}>
                          <MenuItem value="">Select a course</MenuItem>
                          {(hubCourses ?? []).map((c) => (
                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                          ))}
                        </TextField>
                      );
                    }
                    if (field.type === "workflow") {
                      return (
                        <TextField key={field.key} select size="small" label={field.label} value={val} onChange={(e) => setVal(e.target.value)} helperText={field.help} sx={{ minWidth: 240 }}>
                          <MenuItem value="">Select a workflow</MenuItem>
                          {workflows.filter((w) => w.id !== selectedWorkflowId).map((w) => (
                            <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
                          ))}
                        </TextField>
                      );
                    }
                    if (field.type === "lmsCourse") {
                      if (!activeInstitution) {
                        return (
                          <TextField
                            key={field.key}
                            size="small"
                            label={field.label}
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            helperText={field.help || "Paste the Canvas course URL, e.g. https://<canvas>/courses/12345"}
                            sx={{ minWidth: 260 }}
                          />
                        );
                      }
                      return (
                        <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
                          <span className={styles.fieldHint}>{field.label}</span>
                          <CoursePicker
                            activeInstitution={activeInstitution}
                            courseUrl={val}
                            onSelect={(url) => setVal(url)}
                          />
                          <p className={styles.fieldHint} style={{ margin: 0 }}>
                            {field.help || "Paste the Canvas course URL, e.g. https://<canvas>/courses/12345"}
                          </p>
                        </div>
                      );
                    }
                    if (field.type === "org") {
                      return (
                        <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
                          <span className={styles.fieldHint}>{field.label}</span>
                          <Typeahead
                            options={(orgs ?? []).map((o) => ({ value: o, label: o }))}
                            value={val}
                            onChange={(v) => setVal(v)}
                            placeholder={orgs === null ? "Loading organizations..." : "Choose an organization..."}
                            loading={orgs === null}
                            noOptionsText="No organizations"
                          />
                          {field.help && (
                            <p className={styles.fieldHint} style={{ margin: 0 }}>
                              {field.help}
                            </p>
                          )}
                          {orgsError && <p className={styles.error}>{orgsError}</p>}
                        </div>
                      );
                    }
                    return (
                      <TextField
                        key={field.key}
                        size="small"
                        type={field.type === "number" ? "number" : "text"}
                        label={field.label}
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        helperText={field.help}
                        sx={{ minWidth: field.type === "number" ? 140 : 260 }}
                        {...(field.type === "number" ? { slotProps: { htmlInput: { min: 1, step: 1 } } } : {})}
                      />
                    );
                  })}

                  {triggerForm.eventType === "webhook" && (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      A secret URL is generated on save. POST to it from any external system to run this workflow.
                    </p>
                  )}

                  {canUnattended ? (
                    <div>
                      <FormControlLabel
                        control={
                          <Checkbox size="small" checked={triggerForm.unattended} onChange={(e) => setTriggerForm((p) => (p ? { ...p, unattended: e.target.checked } : p))} />
                        }
                        label="Watch in the cloud (even when the app is closed)"
                      />
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        Unattended triggers use the current run-form values and provider snapshot; interactive workflows are not eligible.
                      </p>
                    </div>
                  ) : source && !source.serverEvaluable && triggerForm.eventType !== "webhook" ? (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      This event only happens in your browser, so its trigger runs while the app is open.
                    </p>
                  ) : triggerForm.eventType !== "webhook" ? (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      This workflow pauses for input, so its trigger only runs while the app is open.
                    </p>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <TextField select size="small" label="Course (optional)" value={triggerForm.courseId} onChange={(e) => setTriggerForm((p) => (p ? { ...p, courseId: e.target.value } : p))} sx={{ minWidth: 180 }}>
                      <MenuItem value="">None</MenuItem>
                      {(hubCourses ?? []).map((c) => (
                        <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                      ))}
                    </TextField>
                    <TextField select size="small" label="Institution (optional)" value={triggerForm.institution} onChange={(e) => setTriggerForm((p) => (p ? { ...p, institution: e.target.value } : p))} sx={{ minWidth: 160 }}>
                      <MenuItem value="">None</MenuItem>
                      {institutions.map((i) => (
                        <MenuItem key={i} value={i}>{i}</MenuItem>
                      ))}
                    </TextField>
                    <Button variant="contained" size="small" disabled={triggerBusy} onClick={() => void handleCreateTrigger()}>
                      {triggerBusy ? "Saving..." : "Save trigger"}
                    </Button>
                  </div>
                </div>
              );
            })()}

            {triggerError && <p className={styles.error}>{triggerError}</p>}

            {webhookSetup && (
              <div style={{ padding: "12px", marginBottom: "12px", borderRadius: "4px", backgroundColor: webhookSetup.ok ? "var(--success-bg, rgba(76, 175, 80, 0.1))" : "var(--field-bg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "12px" }}>
                  <p style={{ margin: 0, fontSize: "0.9em", lineHeight: "1.4" }}>
                    {webhookSetup.ok && !webhookSetup.alreadyExisted && (
                      <>Instant push webhook registered on <strong>{webhookSetup.org}</strong>. Pushes now fire this trigger immediately.</>
                    )}
                    {webhookSetup.ok && webhookSetup.alreadyExisted && (
                      <>Instant push webhook already active on <strong>{webhookSetup.org}</strong>.</>
                    )}
                    {!webhookSetup.ok && (
                      <>
                        Could not auto-register the instant webhook ({webhookSetup.error}). The trigger still works via the periodic poller. To enable instant firing, add a webhook under {webhookSetup.org} org settings with Payload URL <code style={{ backgroundColor: "var(--field-bg)", padding: "2px 6px", borderRadius: "2px", wordBreak: "break-all" }}>{webhookSetup.url}</code> (shown selectable), Content type application/json, Secret set to your GITHUB_WEBHOOK_SECRET value, and only the push event.
                      </>
                    )}
                  </p>
                  <button
                    onClick={() => setWebhookSetup(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      padding: 0,
                      flex: "none",
                      fontSize: "0.85em",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {(triggers ?? []).some((t) => t.workflowId === selectedDef.id) && (
              <div style={{ marginTop: 16 }}>
                {(triggers ?? []).filter((t) => t.workflowId === selectedDef.id).map((t) => {
                  const courseName = t.courseId
                    ? hubCourses?.find((c) => c.id === t.courseId)?.name ?? "course"
                    : null;
                  const attachment = [courseName, t.institution].filter(Boolean).join(", ");
                  const webhookUrl =
                    t.eventType === "webhook" && t.webhookToken
                      ? `${webhookBaseUrl}/api/triggers/${t.webhookToken}`
                      : null;
                  return (
                    <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--field-border)", fontSize: "0.85em" }}>
                      <span style={{ fontWeight: 600 }}>{t.workflowName}</span>
                      {t.unattended && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>Unattended</span>
                      )}
                      <span style={{ color: "var(--text-secondary)" }}>
                        {describeTrigger(t)}
                        {t.enabled ? "" : " - disabled"}
                        {attachment ? ` - ${attachment}` : ""}
                        {t.lastFiredAt ? ` - last fired ${new Date(t.lastFiredAt).toLocaleString()}` : ""}
                      </span>
                      {webhookUrl && (
                        <code style={{ flexBasis: "100%", fontSize: "0.8em", color: "var(--text-secondary)", wordBreak: "break-all" }}>{webhookUrl}</code>
                      )}
                      <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        {webhookUrl && (
                          <button type="button" className={styles.linkButton} onClick={() => void navigator.clipboard?.writeText(webhookUrl)}>
                            Copy URL
                          </button>
                        )}
                        <button type="button" className={styles.linkButton} onClick={() => void handleToggleTrigger(t)}>
                          {t.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ color: "var(--danger)" }}
                          onClick={() =>
                            triggerRemoveConfirm === t.id
                              ? void handleDeleteTrigger(t.id)
                              : setTriggerRemoveConfirm(t.id)
                          }
                        >
                          {triggerRemoveConfirm === t.id ? "Confirm" : "Remove"}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
