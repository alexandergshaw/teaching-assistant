"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import TabHeader from "./TabHeader";
import WorkflowBuilder from "./WorkflowBuilder";
import GithubRepoPicker from "./GithubRepoPicker";
import CoursePicker from "./CoursePicker";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutionSelection } from "@/lib/institutions";
import { getStoredProvider } from "@/lib/llm-provider";
import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile } from "@/lib/recording-files";
import { uploadCourseZip } from "@/lib/course-files";
import { listCourseHubAction, setCourseMaterialsAction } from "@/app/actions";
import {
  loadCustomWorkflows,
  collectRuntimeFields,
  saveCustomWorkflows,
} from "@/lib/workflows/types";
import {
  allWorkflows,
  COURSE_KICKOFF,
} from "@/lib/workflows/presets";
import {
  getStepDefinition,
  type StepRunSummary,
  type StepRunHelpers,
} from "@/lib/workflows/registry";
import type { WorkflowDef, RuntimeField } from "@/lib/workflows/types";
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
  const { active: activeInstitution } = useInstitutionSelection();

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

  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const [hubCourses, setHubCourses] = useState<Array<{ id: string; name: string }> | null>(null);
  const [hubCoursesError, setHubCoursesError] = useState<string | null>(null);

  const runtimeFields: RuntimeField[] = useMemo(
    () =>
      selectedDef
        ? collectRuntimeFields(selectedDef, (type) => {
            const def = getStepDefinition(type);
            return def?.inputs;
          })
        : [],
    [selectedDef]
  );

  const updateCustom = (next: WorkflowDef[]) => {
    setCustom(next);
    saveCustomWorkflows(next);
  };

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
    const handleStorageChange = () => {
      setCustom(loadCustomWorkflows());
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const needsHubCourse = runtimeFields.some((f) => f.type === "hubCourse");
    if (!needsHubCourse || hubCourses !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listCourseHubAction();
        if (!cancelled) {
          if ("error" in list) {
            setHubCoursesError(list.error);
          } else {
            setHubCourses(list.courses.map((c) => ({ id: c.id, name: c.name })));
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
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const validateForm = (): boolean => {
    setValidationError(null);
    for (const field of runtimeFields) {
      if (!field.required) continue;

      // Only the types the run form renders can be validated here; other
      // types are filled from earlier step outputs.
      const fieldTypes = ["text", "longtext", "number", "repo", "lmsCourse", "hubCourse"];
      if (!fieldTypes.includes(field.type)) continue;

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
    return true;
  };

  const handleRun = async () => {
    if (!selectedDef) return;
    if (!validateForm()) return;

    setRunning(true);
    setValidationError(null);
    setRunState(
      selectedDef.steps.map(() => ({
        status: "pending",
        progress: null,
        summary: null,
        error: null,
      }))
    );

    const stepOutputs: Array<Record<string, unknown>> = [];

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
      saveCourseZip:
        user && supabase
          ? async (courseId: string, blob: Blob, fileName: string) => {
              const list = await listCourseHubAction();
              if ("error" in list) throw new Error(list.error);
              const target = list.courses.find((c) => c.id === courseId);
              const { path } = await uploadCourseZip(
                supabase,
                user.id,
                courseId,
                blob,
                target?.materialsZipPath ?? null
              );
              const r = await setCourseMaterialsAction(courseId, {
                materialsZipName: fileName,
                materialsZipPath: path,
                materialsZipSize: blob.size,
              });
              if ("error" in r) throw new Error(r.error);
            }
          : null,
    };

    for (let i = 0; i < selectedDef.steps.length; i++) {
      const step = selectedDef.steps[i];
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
            resolvedInputs[spec.key] = values[binding.fieldKey] ?? "";
          } else if (binding.source === "step") {
            const output = stepOutputs[binding.stepIndex]?.[binding.outputKey];
            if (output === undefined) {
              throw new Error(`Missing output from step ${binding.stepIndex}.`);
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
        break;
      }
    }

    setRunning(false);
  };

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
          <TextField
            select
            value={selectedWorkflowId}
            onChange={(e) => handleWorkflowChange(e.target.value)}
            size="small"
            fullWidth
          >
            {workflows.map((w) => (
              <MenuItem key={w.id} value={w.id}>
                {w.name}
              </MenuItem>
            ))}
          </TextField>
          {selectedDef && (
            <>
              <p className={styles.fieldHint}>{selectedDef.description}</p>
              {!editing && (
                <div className={styles.fieldHint}>
                  {selectedDef.steps.map((step, i) => {
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
            onClick={() => {
              const newDef: WorkflowDef = {
                id: crypto.randomUUID(),
                name: "New workflow",
                description: "",
                steps: [],
              };
              updateCustom([...custom, newDef]);
              handleWorkflowChange(newDef.id);
              setEditing(true);
            }}
          >
            New workflow
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              if (!selectedDef) return;
              const copied: WorkflowDef = {
                id: crypto.randomUUID(),
                name: `${selectedDef.name} (copy)`,
                description: selectedDef.description,
                steps: JSON.parse(JSON.stringify(selectedDef.steps)),
              };
              updateCustom([...custom, copied]);
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
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>

              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  if (!deleteArmed) {
                    setDeleteArmed(true);
                  } else {
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
            onChange={(next) =>
              updateCustom(custom.map((w) => (w.id === next.id ? next : w)))
            }
            onDone={() => setEditing(false)}
          />
        )}

        {!editing && (
          <>
            {runtimeFields.map((field) => {
              const value = values[field.fieldKey] ?? "";

              if (field.type === "longtext") {
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
                      {hubCourses === null ? (
                        <MenuItem disabled>Loading courses...</MenuItem>
                      ) : hubCourses.length > 0 ? (
                        <>
                          {hubCourses.map((course) => (
                            <MenuItem key={course.id} value={course.id}>
                              {course.name}
                            </MenuItem>
                          ))}
                          {value &&
                            !hubCourses.some((c) => c.id === value) && (
                              <MenuItem value={value}>
                                Previous course (reselect)
                              </MenuItem>
                            )}
                        </>
                      ) : (
                        <MenuItem disabled>No courses available</MenuItem>
                      )}
                    </TextField>
                    {hubCoursesError && (
                      <p className={styles.error}>{hubCoursesError}</p>
                    )}
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
              disabled={running}
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
            const stepDef = selectedDef
              ? getStepDefinition(selectedDef.steps[i]?.type)
              : null;

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
                    {i + 1}. {stepDef?.name ?? selectedDef?.steps[i]?.type}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
