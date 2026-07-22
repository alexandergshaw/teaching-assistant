"use client";
import { Button } from "@mui/material";
import WorkflowBuilder from "../WorkflowBuilder";
import WorkflowScopeControl from "../WorkflowScopeControl";
import { StepOverviewRow } from "./StepOverviewRow";
import { upsertWorkflowDef, deleteWorkflowDef } from "@/lib/workflow-defs";
import { getStepDefinition } from "@/lib/workflows/registry";
import type { WorkflowDef, WorkflowStepConfig, WorkflowScope } from "@/lib/workflows/types";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../../page.module.css";

interface BuildPanelProps {
  selectedDef: WorkflowDef | undefined;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  deleteArmed: boolean;
  setDeleteArmed: (armed: boolean) => void;
  running: boolean;
  expanded: { steps: WorkflowStepConfig[]; origins: Array<string | null>; topIndices: number[]; error: string | null };
  disabledSteps: Set<number>;
  setDisabledSteps: (steps: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  disabledStepsWithEnabledDependents: Set<number>;
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  orgs: string[] | null;
  lmsCourseOptions: Array<{ url: string; name: string }> | null;
  institutions: string[];
  activeInstitution: string | null;
  user: User | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any> | null;
  custom: WorkflowDef[];
  workflows: WorkflowDef[];
  updateCustom: (defs: WorkflowDef[]) => void;
  handleWorkflowChange: (id: string) => void;
  handlePresetScope: (scope: WorkflowScope) => void;
  handleScopeChange: (scope: WorkflowScope) => void;
  pendingDefRef: React.MutableRefObject<WorkflowDef | null>;
  saveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function BuildPanel({
  selectedDef,
  editing,
  setEditing,
  deleteArmed,
  setDeleteArmed,
  running,
  expanded,
  disabledSteps,
  setDisabledSteps,
  disabledStepsWithEnabledDependents,
  hubCourses,
  orgs,
  lmsCourseOptions,
  institutions,
  activeInstitution,
  user,
  supabase,
  custom,
  workflows,
  updateCustom,
  handleWorkflowChange,
  handlePresetScope,
  handleScopeChange,
  pendingDefRef,
  saveTimerRef,
}: BuildPanelProps) {
  return (
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
                      setDisabledSteps((prev: Set<number>) => {
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
                  const newId = next?.id ?? workflows[0]?.id;
                  if (newId) handleWorkflowChange(newId);
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
  );
}
