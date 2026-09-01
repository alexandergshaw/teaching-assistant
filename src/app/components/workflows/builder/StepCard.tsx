"use client";

import { Button, MenuItem, TextField, FormControlLabel, Checkbox } from "@mui/material";
import {
  type WorkflowStepConfig,
  type InputBinding,
  type WorkflowScope,
  type WorkflowDef,
  scopeFamilyForType,
  scopeCoversType,
  applyWorkflowScope,
  describeScopeForType,
} from "@/lib/workflows/types";
import { getStepDefinition, type StepDefinition } from "@/lib/workflows/registry";
import { ALL_SCOPE } from "@/lib/workflows/scope";
import {
  toggleSkipStep,
  setRemapEntry,
  sourceStepLabel,
  resolveSkipIndices,
} from "@/lib/workflows/include-mirror";
import InputBindingRow from "./InputBindingRow";
import DanglingOutputRows from "./DanglingOutputs";
import { type BuilderPickerData } from "./builder-shared";

function StepCard({
  stepIndex,
  step,
  stepDef,
  allSteps,
  includeSourceName,
  onMove,
  onRemove,
  onBindingChange,
  onRunIfChange,
  onIncludeChange,
  expandedIncludeStep,
  setExpandedIncludeStep,
  others,
  picker,
  scope,
}: {
  stepIndex: number;
  step: WorkflowStepConfig;
  stepDef: StepDefinition | undefined;
  allSteps: WorkflowStepConfig[];
  includeSourceName?: string;
  onMove: (index: number, direction: "up" | "down") => void;
  onRemove: (index: number) => void;
  onBindingChange: (
    stepIndex: number,
    inputKey: string,
    source: "runtime" | "step" | "literal",
    sourceStepIndex?: number,
    outputKey?: string,
    literalValue?: string
  ) => void;
  onRunIfChange: (stepIndex: number, binding: InputBinding | null, expected: boolean) => void;
  onIncludeChange: (stepIndex: number, include: NonNullable<WorkflowStepConfig["include"]>) => void;
  expandedIncludeStep: number | null;
  setExpandedIncludeStep: (index: number | null) => void;
  others: WorkflowDef[];
  picker: BuilderPickerData;
  scope?: WorkflowScope;
}) {
  // Include steps allow selecting which source steps to mirror and wiring
  // replacements for skipped step outputs.
  if (step.type === "include-workflow") {
    const include = step.include;
    if (!include) {
      return (
        <div
          style={{
            border: "1px solid var(--field-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            background: "var(--field-background)",
          }}
        >
          <p>Malformed include step (missing include data)</p>
        </div>
      );
    }

    const sourceWorkflow = others.find((w) => w.id === include.workflowId);
    const sourceSteps = sourceWorkflow?.steps ?? [];
    const isExpanded = expandedIncludeStep === stepIndex;
    // Resolved indices, not raw skipSteps.length - an index and an id naming
    // the SAME step must count once, not twice, and an id must actually
    // match a source step to count at all (see resolveSkipIndices).
    const skipIndices = resolveSkipIndices(sourceSteps, include.skipSteps);
    const mirroredCount = sourceSteps.length - skipIndices.size;

    return (
      <div
        style={{
          border: "1px solid var(--field-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3)",
          background: "var(--field-background)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: isExpanded ? "var(--space-3)" : 0,
          }}
        >
          <div style={{ flex: 1 }}>
            <strong>
              {stepIndex + 1}. Include workflow: {includeSourceName ?? "unknown"}
            </strong>{" "}
            <span style={{ opacity: 0.75 }}>
              (dynamic - runs that workflow&apos;s current steps)
            </span>
            {include.skipSteps.length > 0 && (
              <div style={{ fontSize: "var(--font-size-md)", opacity: 0.75, marginTop: "var(--space-1)" }}>
                Mirrors {mirroredCount} of {sourceSteps.length} steps
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--space-1)" }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setExpandedIncludeStep(isExpanded ? null : stepIndex)}
            >
              {isExpanded ? "Hide" : "Choose steps"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onMove(stepIndex, "up")}
              disabled={stepIndex === 0}
            >
              Up
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onMove(stepIndex, "down")}
              disabled={stepIndex === allSteps.length - 1}
            >
              Down
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onRemove(stepIndex)}
            >
              Remove
            </Button>
          </div>
        </div>

        {isExpanded && sourceWorkflow && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <div style={{ fontSize: "var(--font-size-md)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
              Select steps to mirror:
            </div>
            <div style={{ marginBottom: "var(--space-3)" }}>
              {sourceSteps.map((srcStep, srcIdx) => (
                <FormControlLabel
                  key={srcIdx}
                  control={
                    <Checkbox
                      checked={!skipIndices.has(srcIdx)}
                      onChange={(e) => {
                        const newInclude = toggleSkipStep(include, srcIdx, e.target.checked, srcStep.id);
                        onIncludeChange(stepIndex, newInclude);
                      }}
                    />
                  }
                  label={`${srcIdx + 1}. ${sourceStepLabel(srcStep, srcIdx, others, getStepDefinition)}`}
                  style={{ display: "block", marginBottom: "var(--space-1)" }}
                />
              ))}
            </div>

            <DanglingOutputRows
              sourceSteps={sourceSteps}
              skipSteps={include.skipSteps}
              include={include}
              stepIndex={stepIndex}
              allSteps={allSteps}
              picker={picker}
              onRemapChange={(key, binding) => {
                const newInclude = setRemapEntry(include, key, binding);
                onIncludeChange(stepIndex, newInclude);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  if (!stepDef) {
    return (
      <div
        style={{
          border: "1px solid var(--field-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3)",
          background: "var(--field-background)",
        }}
      >
        <p>Unknown step type: {step.type}</p>
      </div>
    );
  }

  const courseScoped = stepDef.inputs.some((s) => {
    const fam = scopeFamilyForType(s.type);
    if (fam !== "hubCourse" && fam !== "lmsCourse") return false;
    const listType = fam === "hubCourse" ? "hubCourseList" : "lmsCourseList";
    return scopeCoversType(scope, listType);
  });

  return (
    <div
      style={{
        border: "1px solid var(--field-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        background: "var(--field-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-3)",
        }}
      >
        <div>
          <strong>
            {stepIndex + 1}. {stepDef.name}
          </strong>
          {stepDef.description && (
            <div style={{ fontSize: "var(--font-size-md)", opacity: 0.7, marginTop: "var(--space-1)", maxWidth: 640 }}>
              {stepDef.description}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onMove(stepIndex, "up")}
            disabled={stepIndex === 0}
          >
            Up
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onMove(stepIndex, "down")}
            disabled={stepIndex === allSteps.length - 1}
          >
            Down
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onRemove(stepIndex)}
          >
            Remove
          </Button>
        </div>
      </div>

      {stepDef.inputs.map((input) => (
        <InputBindingRow
          key={input.key}
          stepIndex={stepIndex}
          input={input}
          binding={step.bindings[input.key]}
          allStepDefs={allSteps.map((s) => getStepDefinition(s.type))}
          allSteps={allSteps}
          onBindingChange={onBindingChange}
          picker={picker}
          scope={scope}
          courseScoped={courseScoped}
        />
      ))}

      {(() => {
        const boolOutputs: Array<{ stepIndex: number; outputKey: string; label: string }> = [];
        for (let j = 0; j < stepIndex; j++) {
          const def2 = getStepDefinition(allSteps[j].type);
          if (!def2) continue;
          for (const out of def2.outputs) {
            if (out.type === "boolean") {
              boolOutputs.push({ stepIndex: j, outputKey: out.key, label: `Step ${j + 1}: ${out.label}` });
            }
          }
        }
        if (boolOutputs.length === 0) return null;

        const runIf = step.runIf;
        // This selector's own options (boolOutputs, above) are positional
        // only, so an id-bound gate must resolve to the position it names
        // to show as selected - the same resolution InputBindingRow and
        // DanglingOutputRow use for the same reason.
        let runIfStepIndex: number | undefined;
        if (runIf && runIf.binding.source === "step") {
          const runIfBinding = runIf.binding;
          runIfStepIndex =
            "stepIndex" in runIfBinding
              ? runIfBinding.stepIndex
              : allSteps.findIndex((s) => s.id === runIfBinding.stepId);
          if (runIfStepIndex === -1) runIfStepIndex = undefined;
        }
        const current =
          runIf && runIf.binding.source === "step" && runIfStepIndex !== undefined
            ? `${runIfStepIndex}:${runIf.binding.outputKey}`
            : "always";
        const expected = runIf ? runIf.expected : true;

        return (
          <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ flex: 0, minWidth: "120px", fontSize: "var(--font-size-md)" }}>Run only if</label>
            <TextField
              select
              size="small"
              value={current}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "always") {
                  onRunIfChange(stepIndex, null, true);
                } else {
                  const [siStr, ok] = v.split(":");
                  onRunIfChange(
                    stepIndex,
                    { source: "step", stepIndex: Number(siStr), outputKey: ok },
                    expected
                  );
                }
              }}
              style={{ minWidth: 220 }}
            >
              <MenuItem value="always">Always run</MenuItem>
              {boolOutputs.map((o) => (
                <MenuItem key={`${o.stepIndex}:${o.outputKey}`} value={`${o.stepIndex}:${o.outputKey}`}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            {current !== "always" && runIf && runIf.binding.source === "step" && (
              <TextField
                select
                size="small"
                value={expected ? "true" : "false"}
                onChange={(e) =>
                  onRunIfChange(stepIndex, runIf.binding, e.target.value === "true")
                }
                style={{ minWidth: 120 }}
              >
                <MenuItem value="true">is true</MenuItem>
                <MenuItem value="false">is false</MenuItem>
              </TextField>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// A friendly summary of the value the workflow scope inherits into an input,
// resolving course-tile ids to names via the picker where possible.
function inheritedScopeSummary(
  type: string,
  scope: WorkflowScope | undefined,
  picker: BuilderPickerData
): string {
  const eff = applyWorkflowScope(type, "", scope).trim();
  if (!eff) return "";
  const hubName = (id: string) => picker.hubCourses?.find((c) => c.id === id)?.name ?? id;
  const items = eff.split("\n").map((s) => s.trim()).filter(Boolean);
  switch (type) {
    case "hubCourse":
      return hubName(eff);
    case "hubCourseList":
      return eff === ALL_SCOPE ? "All course tiles" : items.map(hubName).join(", ");
    case "orgList":
      return eff === ALL_SCOPE ? "All organizations" : items.join(", ");
    case "lmsCourseList":
      return eff === ALL_SCOPE ? "All Canvas courses" : items.join(", ");
    case "institution":
    case "org":
    case "lmsCourse":
      return eff;
    default:
      return describeScopeForType(scope, type);
  }
}

export { StepCard, inheritedScopeSummary };
export default StepCard;
