"use client";

import React, { Fragment, useState, useEffect } from "react";
import { RuntimeFieldInput } from "./RuntimeFieldInput";
import { Button } from "@mui/material";
import { RunStepCard } from "./RunStepCard";
import { RunInputPrompt } from "./RunInputPrompt";
import { SummaryView, compareTableValues, csvCell, tableGradeIssue, GradeBadge, DetailSectionsView, type GradeBand } from "./run-results";
import { describeWorkflowScope } from "@/lib/workflows/types";
import { getStepDefinition } from "@/lib/workflows/registry";
import type { WorkflowDef, RuntimeField, WorkflowStepConfig } from "@/lib/workflows/types";
import type { UseWorkflowRunReturn } from "./useWorkflowRun";
import { buildCourseFanoutSummary, countOkCourses, type RunStateGroup } from "./attended-fanout";
import { composedGroupLabel } from "@/lib/workflows/fanout";
import styles from "../../page.module.css";

interface WorkflowOptions {
  orgs: string[] | null;
  orgsError: string | null;
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  hubCoursesError: string | null;
  lmsCourseOptions: Array<{ url: string; name: string }> | null;
  lmsCourseOptionsError: string | null;
  lmsModuleOptions: Array<{ value: string; label: string }>;
  lmsModuleError: string | null;
  lmsModuleFromExport: boolean;
  deckTemplates: Array<{ id: string; name: string }> | null;
  deckTemplatesError: string | null;
  institutions: string[];
  activeInstitution: string | null;
}

interface RunPanelProps {
  selectedDef: WorkflowDef;
  runtimeFields: RuntimeField[];
  values: Record<string, string>;
  onValueChange: (fieldKey: string, value: string) => void;
  workflowRunning: boolean;
  validationError: string | null;
  runState: RunStateGroup[];
  stopRequested: boolean;
  onStopAfterCourse: () => void;
  runPause: {
    groupIndex: number;
    stepIndex: number;
    message: string;
  } | null;
  runInput: UseWorkflowRunReturn["runInput"];
  pauseResolverRef: React.MutableRefObject<{ resolve: (go: boolean) => void } | null>;
  inputResolverRef: React.MutableRefObject<{ resolve: (value: string | Record<string, string>[] | File[] | null) => void } | null>;
  onRunClick: () => void;
  expandedError: string | null;
  allStepsDisabled: boolean;
  uploadFiles: Record<string, File[]>;
  onUploadFilesChange: (files: Record<string, File[]> | ((prev: Record<string, File[]>) => Record<string, File[]>)) => void;
  optionsForFields: WorkflowOptions;
  tableHasGrade: boolean;
  tableGradeBand: (row: Record<string, string>) => { band: GradeBand; pct: number | null };
  initialRunInputRows: Array<Record<string, string>>;
  expandedSteps: WorkflowStepConfig[];
  expandedOrigins: Array<string | null>;
  getStepDefinition: (type: string) => ReturnType<typeof getStepDefinition> | undefined;
}

export function RunPanel({
  selectedDef,
  runtimeFields,
  values,
  onValueChange,
  workflowRunning,
  validationError,
  runState,
  stopRequested,
  onStopAfterCourse,
  runPause,
  runInput,
  pauseResolverRef,
  inputResolverRef,
  onRunClick,
  expandedError,
  allStepsDisabled,
  uploadFiles,
  onUploadFilesChange,
  optionsForFields,
  tableHasGrade,
  tableGradeBand,
  initialRunInputRows,
  expandedSteps,
  expandedOrigins,
  getStepDefinition,
}: RunPanelProps) {
  const [optionalFieldsOpen, setOptionalFieldsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("ta-workflows-optional-open");
    return saved === "true";
  });

  useEffect(() => {
    try {
      localStorage.setItem("ta-workflows-optional-open", optionalFieldsOpen ? "true" : "false");
    } catch {
      // ignore storage write failures
    }
  }, [optionalFieldsOpen]);

  const requiredFields = runtimeFields.filter((f) => f.required);
  const optionalFields = runtimeFields.filter((f) => !f.required);
  const showOptionalDisclosure = optionalFields.length >= 3;
  const isCourseFanoutRun = runState.some((grp) => !!grp.courseId);

  // Auto-expand disclosure on validation errors targeting hidden fields
  if (validationError && !optionalFieldsOpen && showOptionalDisclosure) {
    const errorText = validationError.toLowerCase();
    const optionalFieldNames = optionalFields.map((f) => f.label.toLowerCase());
    if (optionalFieldNames.some((name) => errorText.includes(name))) {
      setOptionalFieldsOpen(true);
    }
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 4px 0" }}>{selectedDef.name}</h2>
        {selectedDef.description && (
          <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
            {selectedDef.description}
          </p>
        )}
        {describeWorkflowScope(selectedDef.scope) && (
          <div className={styles.ghBadge} style={{ display: "inline-block", fontSize: "0.85em", padding: "4px 8px" }}>
            Scoped: {describeWorkflowScope(selectedDef.scope)}
          </div>
        )}
      </div>

      {requiredFields.map((field) => (
        <RuntimeFieldInput
          key={field.fieldKey}
          field={field}
          value={values[field.fieldKey] ?? ""}
          onChange={(newValue) => onValueChange(field.fieldKey, newValue)}
          options={{
            orgs: optionsForFields.orgs,
            orgsError: optionsForFields.orgsError,
            hubCourses: optionsForFields.hubCourses,
            hubCoursesError: optionsForFields.hubCoursesError,
            lmsCourseOptions: optionsForFields.lmsCourseOptions,
            lmsCourseOptionsError: optionsForFields.lmsCourseOptionsError,
            lmsModuleOptions: optionsForFields.lmsModuleOptions,
            lmsModuleError: optionsForFields.lmsModuleError,
            lmsModuleFromExport: optionsForFields.lmsModuleFromExport,
            lmsModuleCanvasUrl: "",
            deckTemplates: optionsForFields.deckTemplates,
            deckTemplatesError: optionsForFields.deckTemplatesError,
            institutions: optionsForFields.institutions,
            activeInstitution: optionsForFields.activeInstitution,
          }}
          uploads={{
            files: uploadFiles,
            setFiles: onUploadFilesChange,
          }}
        />
      ))}

      {showOptionalDisclosure && (
        <>
          <button
            type="button"
            onClick={() => setOptionalFieldsOpen(!optionalFieldsOpen)}
            style={{
              textAlign: "left",
              padding: "6px 0",
              borderRadius: 0,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: "var(--text-primary)",
              fontWeight: 600,
              fontSize: "0.9em",
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              marginTop: 8,
              marginBottom: 8,
            }}
            aria-expanded={optionalFieldsOpen}
          >
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                transform: optionalFieldsOpen ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 0.2s",
              }}
            >
              <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 2L3 4L5 2" stroke="currentColor" strokeWidth="0.75" />
              </svg>
            </span>
            Optional inputs ({optionalFields.length})
          </button>

          {optionalFieldsOpen &&
            optionalFields.map((field) => (
              <RuntimeFieldInput
                key={field.fieldKey}
                field={field}
                value={values[field.fieldKey] ?? ""}
                onChange={(newValue) => onValueChange(field.fieldKey, newValue)}
                options={{
                  orgs: optionsForFields.orgs,
                  orgsError: optionsForFields.orgsError,
                  hubCourses: optionsForFields.hubCourses,
                  hubCoursesError: optionsForFields.hubCoursesError,
                  lmsCourseOptions: optionsForFields.lmsCourseOptions,
                  lmsCourseOptionsError: optionsForFields.lmsCourseOptionsError,
                  lmsModuleOptions: optionsForFields.lmsModuleOptions,
                  lmsModuleError: optionsForFields.lmsModuleError,
                  lmsModuleFromExport: optionsForFields.lmsModuleFromExport,
                  lmsModuleCanvasUrl: "",
                  deckTemplates: optionsForFields.deckTemplates,
                  deckTemplatesError: optionsForFields.deckTemplatesError,
                  institutions: optionsForFields.institutions,
                  activeInstitution: optionsForFields.activeInstitution,
                }}
                uploads={{
                  files: uploadFiles,
                  setFiles: onUploadFilesChange,
                }}
              />
            ))}
        </>
      )}

      {optionalFields.length < 3 &&
        optionalFields.map((field) => (
          <RuntimeFieldInput
            key={field.fieldKey}
            field={field}
            value={values[field.fieldKey] ?? ""}
            onChange={(newValue) => onValueChange(field.fieldKey, newValue)}
            options={{
              orgs: optionsForFields.orgs,
              orgsError: optionsForFields.orgsError,
              hubCourses: optionsForFields.hubCourses,
              hubCoursesError: optionsForFields.hubCoursesError,
              lmsCourseOptions: optionsForFields.lmsCourseOptions,
              lmsCourseOptionsError: optionsForFields.lmsCourseOptionsError,
              lmsModuleOptions: optionsForFields.lmsModuleOptions,
              lmsModuleError: optionsForFields.lmsModuleError,
              lmsModuleFromExport: optionsForFields.lmsModuleFromExport,
              lmsModuleCanvasUrl: "",
              deckTemplates: optionsForFields.deckTemplates,
              deckTemplatesError: optionsForFields.deckTemplatesError,
              institutions: optionsForFields.institutions,
              activeInstitution: optionsForFields.activeInstitution,
            }}
            uploads={{
              files: uploadFiles,
              setFiles: onUploadFilesChange,
            }}
          />
        ))}

      {validationError && <p className={styles.error}>{validationError}</p>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          variant="contained"
          onClick={onRunClick}
          disabled={workflowRunning || !!runPause || !!runInput || !!expandedError || allStepsDisabled}
          size="small"
        >
          {workflowRunning ? "Running..." : "Run"}
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
          {(runState.some((grp) => grp.institution !== null) || isCourseFanoutRun) && (
            <p className={styles.fieldHint} style={{ margin: "0 0 12px 0" }}>
              {isCourseFanoutRun ? countOkCourses(runState) : runState.filter((grp) => grp.steps.every((s) => s.status !== "error")).length}/{runState.length} {isCourseFanoutRun ? "courses" : "institutions"} ok
            </p>
          )}
          {workflowRunning && isCourseFanoutRun && (
            <div style={{ marginBottom: 12 }}>
              <Button size="small" variant="outlined" onClick={onStopAfterCourse} disabled={stopRequested}>
                {stopRequested ? "Stopping after this course..." : "Stop after this course"}
              </Button>
            </div>
          )}
          {runState.map((group, g) => (
            <Fragment key={group.courseId ?? group.institution ?? g}>
              {group.institution && !group.courseId && (
                <h3 style={{ fontSize: "0.85rem", fontWeight: 600, margin: g === 0 ? "0 0 4px 0" : "20px 0 4px 0", color: "var(--hint-text)" }}>
                  {group.institution}
                </h3>
              )}
              {group.courseId && (
                <h3 style={{ fontSize: "0.85rem", fontWeight: 600, margin: g === 0 ? "0 0 4px 0" : "20px 0 4px 0", color: "var(--hint-text)" }}>
                  Course {g + 1} of {runState.length}: {composedGroupLabel(group.courseName ?? "", group.institution)}
                </h3>
              )}
              {group.steps.map((state, i) => {
                const stepDef = getStepDefinition(expandedSteps[i]?.type ?? "");
                return (
                  <RunStepCard
                    key={i}
                    index={i}
                    stepDef={stepDef}
                    origin={expandedOrigins[i] ?? undefined}
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
                          inputResolverRef.current?.resolve(value as string | Record<string, string>[] | File[] | null);
                        }}
                        onSkip={() => {
                          inputResolverRef.current?.resolve(null);
                        }}
                        tableHasGrade={tableHasGrade}
                        tableGradeIssue={tableGradeIssue}
                        tableGradeBand={tableGradeBand}
                        compareTableValues={compareTableValues}
                        csvCell={csvCell}
                        initialRows={initialRunInputRows}
                        GradeBadge={GradeBadge}
                        DetailSectionsView={DetailSectionsView}
                      />
                    )}
                  </RunStepCard>
                );
              })}
            </Fragment>
          ))}

          {!workflowRunning && isCourseFanoutRun && (
            <div style={{ marginTop: 20 }}>
              {runState.map((group, g) => {
                const status = group.courseStatus ?? "skipped";
                const badgeClass =
                  status === "ok"
                    ? styles.ghBadgeSuccess
                    : status === "failed"
                    ? styles.ghBadgeDanger
                    : styles.ghBadgeNeutral;
                const label = status === "ok" ? "OK" : status === "failed" ? "Failed" : "Skipped";
                return (
                  <div
                    key={group.courseId ?? g}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom: "1px solid var(--field-border)",
                    }}
                  >
                    <span>{group.courseName}</span>
                    <span className={`${styles.ghBadge} ${badgeClass}`}>{label}</span>
                  </div>
                );
              })}
              <p className={styles.fieldHint} style={{ marginTop: 12, fontWeight: 600 }}>
                {buildCourseFanoutSummary(
                  runState.map((group) => ({
                    courseId: group.courseId ?? "",
                    courseName: group.courseName ?? "",
                    status: group.courseStatus ?? "skipped",
                  }))
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
