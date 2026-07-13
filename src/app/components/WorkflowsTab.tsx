"use client";

import { useEffect, useMemo, useState, useRef, Fragment } from "react";
import { Button, TextField, MenuItem, Autocomplete, FormControlLabel, Checkbox } from "@mui/material";
import TabHeader from "./TabHeader";
import WorkflowBuilder from "./WorkflowBuilder";
import GithubRepoPicker from "./GithubRepoPicker";
import CoursePicker from "./CoursePicker";
import Typeahead from "./ui/Typeahead";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutionSelection } from "@/lib/institutions";
import { getStoredProvider } from "@/lib/llm-provider";
import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile, listRecordingFiles, downloadRecordingFile, extForFile } from "@/lib/recording-files";
import { uploadCourseZip, removeCourseZip } from "@/lib/course-files";
import { loadCommonResources } from "@/lib/common-resources";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { listCourseHubAction, appendCourseMaterialFileAction, appendCourseExportFileAction, listMyOrgsAction, listCoursesAction, listCourseContentAction, runSubmissionCodeAction } from "@/app/actions";
import type { CodeRunResult } from "@/lib/code-runner";
import type { CanvasModule } from "@/lib/canvas-modules";
import {
  loadCustomWorkflows,
  collectRuntimeFields,
  saveCustomWorkflows,
  expandWorkflowDef,
} from "@/lib/workflows/types";
import {
  listWorkflowDefs,
  upsertWorkflowDef,
  deleteWorkflowDef,
} from "@/lib/workflow-defs";
import {
  allWorkflows,
  COURSE_KICKOFF,
} from "@/lib/workflows/presets";
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

export default function WorkflowsTab() {
  const { supabase, user } = useSupabase();
  const { institutions, active: activeInstitution } = useInstitutionSelection();

  const pendingDefRef = useRef<WorkflowDef | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [custom, setCustom] = useState<WorkflowDef[]>(() =>
    typeof window === "undefined" ? [] : loadCustomWorkflows()
  );
  const workflows = allWorkflows(custom);

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

  const [runState, setRunState] = useState<
    Array<{
      status: "pending" | "running" | "done" | "error";
      progress: string | null;
      summary: StepRunSummary | null;
      error: string | null;
    }>
  >([]);

  const [running, setRunning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [runPause, setRunPause] = useState<{ stepIndex: number; message: string } | null>(null);
  const pauseResolverRef = useRef<{ resolve: (go: boolean) => void } | null>(null);

  const [runInput, setRunInput] = useState<{
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
  const [runInputDetails, setRunInputDetails] = useState<Record<number, { open: boolean; status: "loading" | "done" | "error"; detail: TableRowDetail | null; error: string; run?: { status: "running" | "done"; result: CodeRunResult | null } }>>({});
  const [pendingHandoff, setPendingHandoff] = useState<{ workflowId: string; prefill: Record<string, string> } | null>(null);

  const [uploadFiles, setUploadFiles] = useState<Record<string, File[]>>({});

  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

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

  const [orgs, setOrgs] = useState<string[] | null>(null);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  // Include steps expand before anything reads the step list: the run form,
  // step overview, and runner all operate on expanded coordinates.
  const expanded = useMemo<{
    steps: WorkflowStepConfig[];
    origins: Array<string | null>;
    error: string | null;
  }>(() => {
    if (!selectedDef) return { steps: [], origins: [], error: null };
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
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [selectedDef, workflows]);

  const runtimeFields: RuntimeField[] = useMemo(
    () =>
      selectedDef
        ? collectRuntimeFields(
            { ...selectedDef, steps: expanded.steps },
            (type) => {
              const def = getStepDefinition(type);
              return def?.inputs;
            }
          )
        : [],
    [selectedDef, expanded]
  );

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
  }

  useEffect(() => {
    if (!lmsModuleNeeded) return;
    // No live LMS connection: the render-phase reset above already cleared
    // the options, so there is nothing to fetch.
    if (!lmsModuleCanvasUrl) return;

    let cancelled = false;

    (async () => {
      try {
        const content = await listCourseContentAction(
          lmsModuleCanvasUrl,
          activeInstitution || undefined
        );
        if (cancelled) return;
        if ("error" in content) {
          setLmsModuleError(content.error);
          setLmsModuleOptions([]);
        } else {
          setLmsModuleOptions(
            content.modules.map((m: CanvasModule) => ({
              value: String(m.id),
              label: m.name,
            }))
          );
          setLmsModuleError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLmsModuleError(
            err instanceof Error ? err.message : "Could not load modules."
          );
          setLmsModuleOptions([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lmsModuleNeeded, lmsModuleCanvasUrl, activeInstitution]);

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
        }
      } catch (err) {
        console.error("Failed to load workflows from database:", err);
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

  useEffect(() => {
    const needsHubCourse = runtimeFields.some((f) => f.type === "hubCourse" || f.type === "hubCourseList");
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
  }, [runtimeFields, hubCourses]);

  useEffect(() => {
    const needsLmsCourseList = runtimeFields.some((f) => f.type === "lmsCourseList");
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
  }, [runtimeFields, lmsCourseOptions, activeInstitution]);

  useEffect(() => {
    const needsOrg = runtimeFields.some((f) => f.type === "org");
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
  }, [runtimeFields, orgs]);

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
      const fieldTypes = ["text", "longtext", "number", "date", "repo", "lmsCourse", "lmsCourseList", "hubCourse", "org", "institution", "hubCourseList", "uploads"];
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
    if (!validateForm()) return;

    setRunning(true);
    setValidationError(null);
    setRunInput(null);
    setRunInputBusy(false);
    setRunInputError(null);
    inputResolverRef.current = null;
    setRunState(
      expanded.steps.map(() => ({
        status: "pending",
        progress: null,
        summary: null,
        error: null,
      }))
    );

    const stepOutputs: Array<Record<string, unknown>> = [];
    const failedSteps = new Set<number>();

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
              const { path } = await uploadCourseZip(
                supabase,
                user.id,
                courseId,
                blob,
                null
              );
              const r = await appendCourseExportFileAction(courseId, {
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
    };

    // Expanded steps carry bindings already translated into expanded
    // coordinates, so the runner indexes stepOutputs directly.
    for (let i = 0; i < expanded.steps.length; i++) {
      const step = expanded.steps[i];
      const def = getStepDefinition(step.type);

      setRunState((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "running" };
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
              resolvedInputs[spec.key] = values[binding.fieldKey] ?? "";
            }
          } else if (binding.source === "step") {
            if (failedSteps.has(binding.stepIndex)) {
              const failedDef = getStepDefinition(expanded.steps[binding.stepIndex]?.type ?? "");
              throw new Error(`Skipped - depends on step ${binding.stepIndex + 1} ("${failedDef?.name ?? "unknown step"}"), which failed.`);
            }
            const output = stepOutputs[binding.stepIndex]?.[binding.outputKey];
            if (output === undefined) {
              throw new Error(`Missing output from step ${binding.stepIndex + 1}.`);
            }
            resolvedInputs[spec.key] = output;
          } else if (binding.source === "literal") {
            resolvedInputs[spec.key] = binding.value;
          }
        }

        const onProgress = (text: string) => {
          setRunState((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], progress: text };
            return next;
          });
        };

        const result = await def.run(resolvedInputs, helpers, onProgress);
        stepOutputs[i] = result.outputs;

        setRunState((prev) => {
          const next = [...prev];
          next[i] = {
            status: "done",
            progress: null,
            summary: result.summary,
            error: null,
          };
          return next;
        });

        if (result.requireConfirmation) {
          await new Promise<void>((resolve) => {
            setRunPause({ stepIndex: i, message: result.requireConfirmation! });
            pauseResolverRef.current = {
              resolve: (go: boolean) => {
                setRunPause(null);
                pauseResolverRef.current = null;
                if (!go) {
                  failedSteps.add(i);
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

          await new Promise<void>((resolve) => {
            setRunInput({
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
          next[i] = {
            status: "error",
            progress: null,
            summary: null,
            error: errorMsg,
          };
          return next;
        });
        failedSteps.add(i);
      }
    }

    // A cancelled or failed run must not fire the mid-run handoff.
    if (failedSteps.size > 0) {
      setPendingHandoff(null);
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

  return (
    <div className={styles.card}>
      <TabHeader
        eyebrow="Workflows"
        title="Composite actions"
        subtitle="Kick off multi-step jobs that chain the app's tools together: schedules, repos, lecture materials, and LMS population in one run."
      />

      <div className={styles.form}>
        <div className={styles.field}>
          <label>Workflow</label>
          <Typeahead
            disabled={running}
            options={workflows.map((w) => ({
              value: w.id,
              label: w.name,
              hint: w.preset ? "Preset" : "Custom",
            }))}
            value={selectedWorkflowId}
            onChange={(v) => {
              if (v) handleWorkflowChange(v);
            }}
            placeholder="Choose a workflow..."
          />
          {selectedDef && (
            <>
              <p className={styles.fieldHint}>{selectedDef.description}</p>
              {expanded.error && (
                <p className={styles.error}>{expanded.error}</p>
              )}
              {!editing && (
                <div className={styles.fieldHint}>
                  {expanded.steps.map((step, i) => {
                    const stepDef = getStepDefinition(step.type);
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
                      <div key={i}>
                        {i + 1}. {stepDef?.name ?? step.type}
                        {expanded.origins[i] && (
                          <span style={{ marginLeft: 6, opacity: 0.75 }}>
                            (from {expanded.origins[i]})
                          </span>
                        )}
                        {bindings && (
                          <span style={{ marginLeft: 8 }}>({bindings})</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
            }}
          >
            New workflow
          </Button>

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

        {!editing && (
          <>
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
                const urlArray = value.split("\n").map((s) => s.trim()).filter(Boolean);
                const selectedOptions = urlArray.map((url) => {
                  const found = lmsCourseOptions?.find((o) => o.url === url);
                  return found || { url, name: url };
                });
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
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
                const idArray = value.split("\n").map((s) => s.trim()).filter(Boolean);
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
                        input.accept = ".imscc,.zip";
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
                return (
                  <div key={field.fieldKey} className={styles.field}>
                    <label>{field.label}</label>
                    {!lmsModuleCanvasUrl ? (
                      <p className={styles.fieldHint}>
                        No live LMS connection - the step will fall back to the
                        tile&apos;s export.
                      </p>
                    ) : (
                      <Typeahead
                        options={lmsModuleOptions}
                        value={value}
                        onChange={(v) => handleValueChange(field.fieldKey, v)}
                        placeholder="Choose a module..."
                        noOptionsText={
                          lmsModuleError
                            ? `Error: ${lmsModuleError}`
                            : "No modules available"
                        }
                      />
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

            <Button
              variant="contained"
              onClick={handleRun}
              disabled={running || !!runPause || !!runInput || !!expanded.error}
              size="small"
            >
              {running ? "Running..." : "Run"}
            </Button>
          </>
        )}
      </div>

      {runState.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 16 }}>Run Progress</h2>
          {runState.map((state, i) => {
            const stepDef = getStepDefinition(expanded.steps[i]?.type ?? "");

            const badgeClass =
              state.status === "pending"
                ? styles.ghBadgeNeutral
                : state.status === "running"
                  ? styles.ghBadgeAccent
                  : state.status === "done"
                    ? styles.ghBadgeSuccess
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
                    {state.status === "error" ? "Failed" : state.status}
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

                {runPause && runPause.stepIndex === i && (
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

                {runInput && runInput.stepIndex === i && (
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
                      <div style={{ maxHeight: 400, overflow: "auto", marginTop: 8 }}>
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
                                    padding: "6px 8px",
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
                                    checked={runInputChecked.every((c) => c)}
                                    indeterminate={runInputChecked.some((c) => c) && !runInputChecked.every((c) => c)}
                                    onChange={() => {
                                      const allChecked = runInputChecked.every((c) => c);
                                      setRunInputChecked(runInputChecked.map(() => !allChecked));
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
                                    padding: "6px 8px",
                                    fontWeight: "bold",
                                    width: col.width,
                                    position: "sticky",
                                    top: 0,
                                    background: "var(--card-background)",
                                    zIndex: 1,
                                  }}
                                >
                                  {col.label}
                                </th>
                              ))}
                              {runInput.rowDetail && (
                                <th
                                  style={{
                                    textAlign: "center",
                                    borderBottom: "1px solid var(--field-border)",
                                    padding: "6px 8px",
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
                            {runInputRows.map((row, rowIndex) => {
                              const detail = runInputDetails[rowIndex];
                              const hasDetail = runInput.rowDetail !== undefined;
                              const colSpan = (runInput.selectable ? 1 : 0) + (runInput.columns?.length ?? 0) + (hasDetail ? 1 : 0);
                              return (
                                <Fragment key={rowIndex}>
                                  <tr style={{ background: rowIndex % 2 === 1 ? "var(--surface-subtle)" : undefined }}>
                                    {runInput.selectable && (
                                      <td
                                        style={{
                                          borderBottom: "1px solid var(--field-border)",
                                          padding: "6px 8px",
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
                                          padding: "6px 8px",
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
                                      </td>
                                    ))}
                                    {hasDetail && (
                                      <td
                                        style={{
                                          borderBottom: "1px solid var(--field-border)",
                                          padding: "6px 8px",
                                          textAlign: "center",
                                        }}
                                      >
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
                                        style={{
                                          borderBottom: "1px solid var(--field-border)",
                                          padding: "8px",
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
                                                whiteSpace: "pre-wrap",
                                                fontSize: "0.85rem",
                                                padding: "8px",
                                                background: "var(--surface-subtle)",
                                                borderRadius: "4px",
                                                marginBottom: "12px",
                                              }}
                                            >
                                              {detail.detail.text}
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
                                                    <div key={file.name}>
                                                      <div style={{ fontWeight: "bold", marginTop: "8px", marginBottom: "4px" }}>{file.name}</div>
                                                      <pre
                                                        style={{
                                                          fontFamily: "monospace",
                                                          fontSize: "0.8rem",
                                                          whiteSpace: "pre-wrap",
                                                          margin: "4px 0 12px",
                                                          maxHeight: 240,
                                                          overflow: "auto",
                                                          padding: 8,
                                                          background: "var(--card-background)",
                                                          border: "1px solid var(--field-border)",
                                                          borderRadius: 4,
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
                                                    } catch {
                                                      setRunInputDetails((prev) => ({
                                                        ...prev,
                                                        [rowIndex]: {
                                                          ...prev[rowIndex]!,
                                                          run: { status: "done", result: null },
                                                        },
                                                      }));
                                                    }
                                                  }}
                                                  style={{ marginTop: "8px" }}
                                                >
                                                  {detail.run?.status === "running" ? "Running..." : detail.run?.result ? "Run again" : "Run code"}
                                                </Button>
                                                {detail.run?.result && (
                                                  <div style={{ marginTop: "12px" }}>
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
                                                  <div style={{ marginTop: "12px", color: "var(--hint-text)", fontSize: "0.85rem" }}>
                                                    No runnable code detected.
                                                  </div>
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
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 8,
                        alignItems: "center",
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
                                  ? runInputRows.filter((_, idx) => runInputChecked[idx]).length === 0
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
                    </div>
                    {runInput.kind === "table" && runInput.selectable && (
                      <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginTop: "8px" }}>
                        {runInputChecked.filter(Boolean).length} of {runInputRows.length} row(s) selected
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
