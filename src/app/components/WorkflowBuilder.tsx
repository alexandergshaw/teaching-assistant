"use client";

import { useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import Typeahead from "./ui/Typeahead";
import {
  type WorkflowDef,
  type WorkflowStepConfig,
  type InputBinding,
  type StepInputSpec,
} from "@/lib/workflows/types";
import {
  STEP_REGISTRY,
  getStepDefinition,
  type StepDefinition,
} from "@/lib/workflows/registry";
import styles from "../page.module.css";

function normalizeBindings(def: WorkflowDef): WorkflowDef {
  const normalized = { ...def };
  normalized.steps = def.steps.map((step, stepIndex) => {
    // Include steps have no own inputs to normalize; their remap is written
    // in this workflow's coordinates and must pass through untouched.
    if (step.type === "include-workflow") return step;

    const stepDef = getStepDefinition(step.type);
    if (!stepDef) return step;

    const normalizedBindings: Record<string, InputBinding> = {};

    for (const input of stepDef.inputs) {
      const binding = step.bindings[input.key];

      if (!binding) {
        normalizedBindings[input.key] = {
          source: "runtime",
          fieldKey: input.key,
        };
        continue;
      }

      if (binding.source === "runtime") {
        normalizedBindings[input.key] = binding;
      } else if (binding.source === "step") {
        const refStepIdx = binding.stepIndex;
        const refStep = def.steps[refStepIdx];
        const refDef = refStep ? getStepDefinition(refStep.type) : null;
        const refOutput = refDef?.outputs.find(
          (o) => o.key === binding.outputKey
        );

        if (
          refStepIdx < stepIndex &&
          refStep &&
          refDef &&
          refOutput &&
          refOutput.type === input.type
        ) {
          normalizedBindings[input.key] = binding;
        } else {
          normalizedBindings[input.key] = {
            source: "runtime",
            fieldKey: input.key,
          };
        }
      } else if (binding.source === "literal") {
        if (["text", "longtext", "number"].includes(input.type)) {
          normalizedBindings[input.key] = binding;
        } else {
          normalizedBindings[input.key] = {
            source: "runtime",
            fieldKey: input.key,
          };
        }
      }
    }

    return {
      ...step,
      bindings: normalizedBindings,
    };
  });

  return normalized;
}

export default function WorkflowBuilder({
  def,
  others,
  onChange,
  onDone,
}: {
  def: WorkflowDef;
  others: WorkflowDef[];
  onChange: (def: WorkflowDef) => void;
  onDone: () => void;
}) {
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [selectedStepType, setSelectedStepType] = useState<string>("");
  const [appendSourceId, setAppendSourceId] = useState<string>("");

  // Appends an independent snapshot of another workflow's steps - later
  // edits to the source workflow do not affect this one.
  const handleAppendWorkflow = () => {
    const source = others.find((w) => w.id === appendSourceId);
    if (!source) return;

    // Step bindings shift by this workflow's length BEFORE appending.
    // Runtime and literal bindings copy as-is: matching runtime fieldKeys
    // merging into one shared run-form field is intentional.
    const offset = def.steps.length;
    const copied: WorkflowStepConfig[] = JSON.parse(
      JSON.stringify(source.steps)
    );
    const remapped = copied.map((step) => {
      const bindings: Record<string, InputBinding> = {};
      for (const [key, binding] of Object.entries(step.bindings)) {
        bindings[key] =
          binding.source === "step"
            ? { ...binding, stepIndex: binding.stepIndex + offset }
            : binding;
      }
      return { ...step, bindings };
    });

    const next = { ...def, steps: [...def.steps, ...remapped] };
    onChange(normalizeBindings(next));
    setAppendSourceId("");
  };

  const handleNameChange = (name: string) => {
    const next = { ...def, name };
    onChange(next);
  };

  const handleDescriptionChange = (description: string) => {
    const next = { ...def, description };
    onChange(next);
  };

  const handleAddStep = (type: string) => {
    const next = {
      ...def,
      steps: [
        ...def.steps,
        {
          type,
          bindings: {},
        },
      ],
    };
    const normalized = normalizeBindings(next);
    onChange(normalized);
    setAddStepOpen(false);
    setSelectedStepType("");
  };

  const handleRemoveStep = (index: number) => {
    const next = {
      ...def,
      steps: def.steps.filter((_, i) => i !== index),
    };

    const remappedSteps = next.steps.map((step) => {
      const remappedBindings: Record<string, InputBinding> = {};
      for (const [key, binding] of Object.entries(step.bindings)) {
        if (binding.source === "step") {
          if (binding.stepIndex > index) {
            remappedBindings[key] = {
              ...binding,
              stepIndex: binding.stepIndex - 1,
            };
          } else if (binding.stepIndex === index) {
            const stepDef = getStepDefinition(step.type);
            const inputSpec = stepDef?.inputs.find((i) => i.key === key);
            if (inputSpec) {
              remappedBindings[key] = {
                source: "runtime",
                fieldKey: inputSpec.key,
              };
            }
          } else {
            remappedBindings[key] = binding;
          }
        } else {
          remappedBindings[key] = binding;
        }
      }
      return { ...step, bindings: remappedBindings };
    });

    next.steps = remappedSteps;
    const normalized = normalizeBindings(next);
    onChange(normalized);
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= def.steps.length) return;

    const swapped = [...def.steps];
    [swapped[index], swapped[newIndex]] = [swapped[newIndex], swapped[index]];

    const remappedSteps = swapped.map((step) => {
      const remappedBindings: Record<string, InputBinding> = {};
      for (const [key, binding] of Object.entries(step.bindings)) {
        if (binding.source === "step") {
          let newStepIdx = binding.stepIndex;
          if (binding.stepIndex === index) {
            newStepIdx = newIndex;
          } else if (binding.stepIndex === newIndex) {
            newStepIdx = index;
          }
          remappedBindings[key] = { ...binding, stepIndex: newStepIdx };
        } else {
          remappedBindings[key] = binding;
        }
      }
      return { ...step, bindings: remappedBindings };
    });

    const next = { ...def, steps: remappedSteps };
    const normalized = normalizeBindings(next);
    onChange(normalized);
  };

  const handleBindingChange = (
    stepIndex: number,
    inputKey: string,
    source: "runtime" | "step" | "literal",
    sourceStepIndex?: number,
    outputKey?: string,
    literalValue?: string
  ) => {
    const step = def.steps[stepIndex];
    if (!step) return;

    let newBinding: InputBinding;

    if (source === "runtime") {
      const stepDef = getStepDefinition(step.type);
      const inputSpec = stepDef?.inputs.find((i) => i.key === inputKey);
      newBinding = {
        source: "runtime",
        fieldKey: inputSpec?.key ?? inputKey,
      };
    } else if (source === "step" && sourceStepIndex !== undefined && outputKey) {
      newBinding = {
        source: "step",
        stepIndex: sourceStepIndex,
        outputKey,
      };
    } else if (source === "literal") {
      newBinding = {
        source: "literal",
        value: literalValue ?? "",
      };
    } else {
      return;
    }

    // Rebuild the changed step immutably so the object held in the parent's
    // React state is never mutated before onChange fires.
    const next = {
      ...def,
      steps: def.steps.map((s, i) =>
        i === stepIndex
          ? { ...s, bindings: { ...s.bindings, [inputKey]: newBinding } }
          : s
      ),
    };
    onChange(next);
  };

  return (
    <div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>Workflow name</label>
          <TextField
            size="small"
            fullWidth
            value={def.name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Description</label>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={def.description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
          />
        </div>

        {def.steps.map((step, i) => (
          <StepCard
            key={i}
            stepIndex={i}
            step={step}
            stepDef={getStepDefinition(step.type)}
            allSteps={def.steps}
            includeSourceName={
              step.type === "include-workflow"
                ? others.find((w) => w.id === step.include?.workflowId)
                    ?.name ?? step.include?.workflowId
                : undefined
            }
            onMove={handleMoveStep}
            onRemove={handleRemoveStep}
            onBindingChange={handleBindingChange}
          />
        ))}

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          {!addStepOpen ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setAddStepOpen(true)}
            >
              Add step
            </Button>
          ) : (
            <>
              <TextField
                select
                size="small"
                value={selectedStepType}
                onChange={(e) => setSelectedStepType(e.target.value)}
                style={{ width: "240px" }}
              >
                <MenuItem value="">Select a step</MenuItem>
                {STEP_REGISTRY.map((s) => (
                  <MenuItem key={s.type} value={s.type}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  if (selectedStepType) {
                    handleAddStep(selectedStepType);
                  }
                }}
                disabled={!selectedStepType}
              >
                Add
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setAddStepOpen(false);
                  setSelectedStepType("");
                }}
              >
                Cancel
              </Button>
            </>
          )}

          <div style={{ width: "260px" }}>
            <Typeahead
              options={others.map((w) => ({
                value: w.id,
                label: w.name,
                hint: w.preset ? "Preset" : "Custom",
              }))}
              value={appendSourceId}
              onChange={setAppendSourceId}
              label="Append steps from workflow"
              placeholder="Choose a workflow..."
            />
          </div>
          <Button
            size="small"
            variant="outlined"
            onClick={handleAppendWorkflow}
            disabled={!appendSourceId}
          >
            Append
          </Button>
        </div>

        <Button
          variant="contained"
          size="small"
          onClick={onDone}
          style={{ marginTop: 8 }}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

function StepCard({
  stepIndex,
  step,
  stepDef,
  allSteps,
  includeSourceName,
  onMove,
  onRemove,
  onBindingChange,
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
}) {
  // Include steps have no binding rows to edit - they run the referenced
  // workflow's CURRENT steps at run time.
  if (step.type === "include-workflow") {
    return (
      <div
        style={{
          border: "1px solid var(--field-border)",
          borderRadius: 12,
          padding: 12,
          background: "var(--field-background)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <strong>
              {stepIndex + 1}. Include workflow: {includeSourceName ?? "unknown"}
            </strong>{" "}
            <span style={{ opacity: 0.75 }}>
              (dynamic - runs that workflow&apos;s current steps)
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
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
      </div>
    );
  }

  if (!stepDef) {
    return (
      <div
        style={{
          border: "1px solid var(--field-border)",
          borderRadius: 12,
          padding: 12,
          background: "var(--field-background)",
        }}
      >
        <p>Unknown step type: {step.type}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--field-border)",
        borderRadius: 12,
        padding: 12,
        background: "var(--field-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <strong>
            {stepIndex + 1}. {stepDef.name}
          </strong>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
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
          onBindingChange={onBindingChange}
        />
      ))}
    </div>
  );
}

function InputBindingRow({
  stepIndex,
  input,
  binding,
  allStepDefs,
  onBindingChange,
}: {
  stepIndex: number;
  input: StepInputSpec;
  binding: InputBinding | undefined;
  allStepDefs: (StepDefinition | undefined)[];
  onBindingChange: (
    stepIndex: number,
    inputKey: string,
    source: "runtime" | "step" | "literal",
    sourceStepIndex?: number,
    outputKey?: string,
    literalValue?: string
  ) => void;
}) {
  let currentSource: "runtime" | "step" | "literal" = "runtime";
  let currentStepIndex: number | undefined;
  let currentOutputKey: string | undefined;
  let currentLiteralValue = "";

  if (binding?.source === "step") {
    currentSource = "step";
    currentStepIndex = binding.stepIndex;
    currentOutputKey = binding.outputKey;
  } else if (binding?.source === "literal") {
    currentSource = "literal";
    currentLiteralValue = binding.value;
  }

  const compatibleStepOutputs: Array<{
    stepIndex: number;
    outputKey: string;
    label: string;
  }> = [];

  for (let j = 0; j < stepIndex; j++) {
    const def = allStepDefs[j];
    if (!def) continue;
    for (const output of def.outputs) {
      if (output.type === input.type) {
        compatibleStepOutputs.push({
          stepIndex: j,
          outputKey: output.key,
          label: `Step ${j + 1} output: ${output.label}`,
        });
      }
    }
  }

  const options: Array<{ value: string; label: string }> = [
    { value: "runtime", label: "Ask when running" },
    ...compatibleStepOutputs.map((o) => ({
      value: `step:${o.stepIndex}:${o.outputKey}`,
      label: o.label,
    })),
  ];

  if (["text", "longtext", "number"].includes(input.type)) {
    options.push({ value: "literal", label: "Fixed value" });
  }

  const selectValue =
    currentSource === "step" && currentStepIndex !== undefined
      ? `step:${currentStepIndex}:${currentOutputKey}`
      : currentSource === "literal"
        ? "literal"
        : "runtime";

  return (
    <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
      <label style={{ flex: 0, minWidth: "120px", fontSize: "0.85rem" }}>
        {input.label}
      </label>
      <TextField
        select
        size="small"
        value={selectValue}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "runtime") {
            onBindingChange(stepIndex, input.key, "runtime");
          } else if (val === "literal") {
            onBindingChange(
              stepIndex,
              input.key,
              "literal",
              undefined,
              undefined,
              currentLiteralValue
            );
          } else if (val.startsWith("step:")) {
            const parts = val.split(":");
            const j = Number(parts[1]);
            const k = parts.slice(2).join(":");
            onBindingChange(
              stepIndex,
              input.key,
              "step",
              j,
              k,
              undefined
            );
          }
        }}
        style={{ flex: 1, minWidth: "200px" }}
      >
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {currentSource === "literal" && (
        <TextField
          size="small"
          type={input.type === "number" ? "number" : "text"}
          value={currentLiteralValue}
          onChange={(e) => {
            onBindingChange(
              stepIndex,
              input.key,
              "literal",
              undefined,
              undefined,
              e.target.value
            );
          }}
          style={{ flex: 0, minWidth: "120px" }}
        />
      )}
    </div>
  );
}
