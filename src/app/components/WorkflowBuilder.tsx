"use client";

import { useMemo, useState } from "react";
import { Autocomplete, Button, TextField, MenuItem, Checkbox, FormControlLabel, createFilterOptions } from "@mui/material";
import Typeahead from "./ui/Typeahead";
import {
  type WorkflowDef,
  type WorkflowStepConfig,
  type InputBinding,
  type StepInputSpec,
  type WorkflowScope,
  expandWorkflowDef,
  outputFeedsInput,
  LITERAL_CAPABLE_TYPES,
  scopeCoversType,
  applyWorkflowScope,
  describeScopeForType,
} from "@/lib/workflows/types";
import { ALL_SCOPE } from "@/lib/workflows/scope";

// Picker data the builder threads down so a "Preset value" (literal) binding can
// be filled with a real course tile / institution / org instead of raw text.
export interface BuilderPickerData {
  hubCourses: Array<{ id: string; name: string }> | null;
  institutions: string[];
  orgs: string[] | null;
}
import {
  STEP_REGISTRY,
  getStepDefinition,
  type StepDefinition,
} from "@/lib/workflows/registry";
import {
  stepCategory,
  stepCategoryLabel,
  stepCategoryOrderIndex,
} from "@/lib/workflows/step-categories";
import styles from "../page.module.css";

// One searchable, category-grouped entry in the "Add action" palette.
interface ActionOption {
  type: string;
  name: string;
  description: string;
  categoryId: string;
  categoryLabel: string;
}

// Match a typed query against the action's name, description, and type slug -
// not just its name - so searching "grade" or "rubric" surfaces everything.
const filterActions = createFilterOptions<ActionOption>({
  stringify: (o) => `${o.name} ${o.description} ${o.type} ${o.categoryLabel}`,
});

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
          outputFeedsInput(refOutput.type, input.type)
        ) {
          normalizedBindings[input.key] = binding;
        } else {
          normalizedBindings[input.key] = {
            source: "runtime",
            fieldKey: input.key,
          };
        }
      } else if (binding.source === "literal") {
        // Scalar literals (text/number/boolean toggles) AND the course /
        // institution / org entity types can carry a fixed value; preserve
        // those so a preset survives normalization. Everything else demotes to
        // an ask-when-running field.
        if (LITERAL_CAPABLE_TYPES.has(input.type)) {
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

// Rewrites every "step"-source index inside a step's own bindings AND, for an
// include step, its include.remap and include.bindOverrides. mapIndex returns a
// new index, or null to demote the binding to a runtime field so no reference
// dangles after a structural edit. Plain-step binding behavior is unchanged.
function remapStepReferences(
  step: WorkflowStepConfig,
  mapIndex: (oldIndex: number) => number | null
): WorkflowStepConfig {
  const remapRecord = (
    record: Record<string, InputBinding>,
    fieldKeyFor: (
      recordKey: string,
      binding: Extract<InputBinding, { source: "step" }>
    ) => string
  ): Record<string, InputBinding> => {
    const out: Record<string, InputBinding> = {};
    for (const [key, binding] of Object.entries(record)) {
      if (binding.source === "step") {
        const mapped = mapIndex(binding.stepIndex);
        out[key] =
          mapped === null
            ? { source: "runtime", fieldKey: fieldKeyFor(key, binding) }
            : { ...binding, stepIndex: mapped };
      } else {
        out[key] = binding;
      }
    }
    return out;
  };

  // Own bindings demote to the input key they fill.
  const bindings = remapRecord(step.bindings, (recordKey) => recordKey);

  if (step.type === "include-workflow" && step.include) {
    // remap/bindOverrides values demote to the binding's own outputKey.
    const include = { ...step.include };
    include.remap = remapRecord(
      step.include.remap,
      (_key, binding) => binding.outputKey
    );
    if (step.include.bindOverrides) {
      include.bindOverrides = remapRecord(
        step.include.bindOverrides,
        (_key, binding) => binding.outputKey
      );
    }
    return { ...step, bindings, include };
  }

  return { ...step, bindings };
}

export default function WorkflowBuilder({
  def,
  others,
  picker,
  onChange,
  onDone,
}: {
  def: WorkflowDef;
  others: WorkflowDef[];
  picker: BuilderPickerData;
  onChange: (def: WorkflowDef) => void;
  onDone: () => void;
}) {
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [appendSourceId, setAppendSourceId] = useState<string>("");
  const [includeSourceId, setIncludeSourceId] = useState<string>("");
  const [includeError, setIncludeError] = useState<string>("");

  // The full action catalog, grouped by category for the palette. Sorted by
  // category order then name so MUI's groupBy renders contiguous groups; the
  // "Other" group (categoryOrderIndex last) catches any step type not yet
  // categorized, so no action can vanish from the builder.
  const actionOptions = useMemo<ActionOption[]>(() => {
    return STEP_REGISTRY.map((s) => {
      const categoryId = stepCategory(s.type);
      return {
        type: s.type,
        name: s.name,
        description: s.description,
        categoryId,
        categoryLabel: stepCategoryLabel(categoryId),
      };
    }).sort((a, b) => {
      const byCategory = stepCategoryOrderIndex(a.categoryId) - stepCategoryOrderIndex(b.categoryId);
      return byCategory !== 0 ? byCategory : a.name.localeCompare(b.name);
    });
  }, []);

  // Appends an independent snapshot of another workflow's steps - later
  // edits to the source workflow do not affect this one.
  const handleAppendWorkflow = () => {
    const source = others.find((w) => w.id === appendSourceId);
    if (!source) return;

    // Step references shift by this workflow's length BEFORE appending.
    // Runtime and literal bindings copy as-is: matching runtime fieldKeys
    // merging into one shared run-form field is intentional. include.remap /
    // include.bindOverrides indices are offset the same way as own bindings.
    const offset = def.steps.length;
    const copied: WorkflowStepConfig[] = JSON.parse(
      JSON.stringify(source.steps)
    );
    const remapped = copied.map((step) =>
      remapStepReferences(step, (oldIndex) => oldIndex + offset)
    );

    const next = { ...def, steps: [...def.steps, ...remapped] };
    onChange(normalizeBindings(next));
    setAppendSourceId("");
  };

  // Includes another workflow's steps dynamically - later edits to the source
  // workflow apply here automatically. Validates via expandWorkflowDef to
  // detect cycles.
  const handleIncludeWorkflow = (sourceId: string) => {
    const source = others.find((w) => w.id === sourceId);
    if (!source) return;

    const candidate: WorkflowDef = {
      ...def,
      steps: [
        ...def.steps,
        {
          type: "include-workflow",
          bindings: {},
          include: {
            workflowId: sourceId,
            skipSteps: [],
            remap: {},
          },
        },
      ],
    };

    // Build a lookup that resolves ids from all available workflows.
    const allDefs = [...others, candidate];
    const lookup = (id: string): WorkflowDef | undefined => {
      return allDefs.find((w) => w.id === id);
    };

    try {
      expandWorkflowDef(candidate, lookup);
      setIncludeError("");
      onChange(normalizeBindings(candidate));
      setIncludeSourceId("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("include cycle")) {
        setIncludeError(
          `Including "${source.name}" would create a cycle - it already includes this workflow (directly or through another include).`
        );
      } else {
        setIncludeError(msg);
      }
    }
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
    // Palette stays open so several actions can be added in a row; the "Done"
    // button closes it.
  };

  const handleRemoveStep = (index: number) => {
    const next = {
      ...def,
      steps: def.steps.filter((_, i) => i !== index),
    };

    // References above the removed step decrement; references TO it demote to a
    // runtime field. Applies to include.remap / include.bindOverrides too.
    const remappedSteps = next.steps.map((step) =>
      remapStepReferences(step, (oldIndex) => {
        if (oldIndex > index) return oldIndex - 1;
        if (oldIndex === index) return null;
        return oldIndex;
      })
    );

    next.steps = remappedSteps;
    const normalized = normalizeBindings(next);
    onChange(normalized);
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= def.steps.length) return;

    const swapped = [...def.steps];
    [swapped[index], swapped[newIndex]] = [swapped[newIndex], swapped[index]];

    // A swap never removes a step, so references only trade the two indices.
    // Applies to include.remap / include.bindOverrides too.
    const remappedSteps = swapped.map((step) =>
      remapStepReferences(step, (oldIndex) => {
        if (oldIndex === index) return newIndex;
        if (oldIndex === newIndex) return index;
        return oldIndex;
      })
    );

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
            picker={picker}
            scope={def.scope}
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
              Add action
            </Button>
          ) : (
            <>
              <Autocomplete<ActionOption>
                options={actionOptions}
                groupBy={(o) => o.categoryLabel}
                getOptionLabel={(o) => o.name}
                filterOptions={filterActions}
                isOptionEqualToValue={(a, b) => a.type === b.type}
                value={null}
                blurOnSelect
                clearOnBlur
                size="small"
                sx={{ width: 320 }}
                onChange={(_, option) => {
                  if (option) handleAddStep(option.type);
                }}
                renderOption={(props, o) => (
                  <li {...(props as React.HTMLAttributes<HTMLLIElement>)} key={o.type}>
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span>{o.name}</span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        {o.description}
                      </span>
                    </span>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    autoFocus
                    label="Add action"
                    placeholder="Search actions..."
                  />
                )}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={() => setAddStepOpen(false)}
              >
                Done
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

          <div style={{ width: "260px" }}>
            <Typeahead
              options={others.map((w) => ({
                value: w.id,
                label: w.name,
                hint: w.preset ? "Preset" : "Custom",
              }))}
              value={includeSourceId}
              onChange={setIncludeSourceId}
              label="Include workflow"
              placeholder="Choose a workflow..."
            />
          </div>
          <Button
            size="small"
            variant="outlined"
            onClick={() => handleIncludeWorkflow(includeSourceId)}
            disabled={!includeSourceId}
          >
            Include
          </Button>
        </div>

        {includeError && (
          <div
            style={{
              color: "var(--error-text, #d32f2f)",
              marginTop: 8,
              marginBottom: 8,
              fontSize: "0.875rem",
            }}
          >
            {includeError}
          </div>
        )}

        <div
          style={{
            marginTop: 8,
            fontSize: "0.875rem",
            opacity: 0.75,
            maxWidth: "500px",
          }}
        >
          Append copies a snapshot; Include stays linked (runs the source
          workflow steps as they are at run time - later edits apply here).
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
  picker: BuilderPickerData;
  scope?: WorkflowScope;
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
          picker={picker}
          scope={scope}
        />
      ))}
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

function InputBindingRow({
  stepIndex,
  input,
  binding,
  allStepDefs,
  onBindingChange,
  picker,
  scope,
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
  picker: BuilderPickerData;
  scope?: WorkflowScope;
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

  const scopeCovered = scopeCoversType(scope, input.type);

  const compatibleStepOutputs: Array<{
    stepIndex: number;
    outputKey: string;
    label: string;
  }> = [];

  for (let j = 0; j < stepIndex; j++) {
    const def = allStepDefs[j];
    if (!def) continue;
    for (const output of def.outputs) {
      if (outputFeedsInput(output.type, input.type)) {
        compatibleStepOutputs.push({
          stepIndex: j,
          outputKey: output.key,
          label: `Step ${j + 1} output: ${output.label}`,
        });
      }
    }
  }

  const options: Array<{ value: string; label: string }> = [
    { value: "runtime", label: scopeCovered ? "From workflow scope" : "Ask when running" },
    ...compatibleStepOutputs.map((o) => ({
      value: `step:${o.stepIndex}:${o.outputKey}`,
      label: o.label,
    })),
  ];

  // A preset ("fixed value") is offered for scalars AND the course /
  // institution / org entity types, so a workflow can hard-set the target and
  // run unmonitored. Entity presets get a real picker below (one / several /
  // all for the list types).
  if (LITERAL_CAPABLE_TYPES.has(input.type) && input.type !== "boolean") {
    options.push({
      value: "literal",
      label: ["text", "longtext", "number"].includes(input.type) ? "Fixed value" : "Preset value",
    });
  }

  const selectValue =
    currentSource === "step" && currentStepIndex !== undefined
      ? `step:${currentStepIndex}:${currentOutputKey}`
      : currentSource === "literal"
        ? "literal"
        : "runtime";

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 0, display: "flex", gap: 8, alignItems: "center" }}>
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
          <LiteralEditor
            type={input.type}
            value={currentLiteralValue}
            picker={picker}
            onChange={(v) =>
              onBindingChange(stepIndex, input.key, "literal", undefined, undefined, v)
            }
          />
        )}
      </div>
      {scopeCovered && currentSource === "runtime" && (
        <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: 4, marginLeft: 128 }}>
          {(() => {
            const summary = inheritedScopeSummary(input.type, scope, picker);
            return summary ? `Set by workflow scope: ${summary}` : "Set by workflow scope";
          })()}
        </div>
      )}
    </div>
  );
}

// The editor for a "Preset value" (literal) binding, rendered by input type: a
// real picker for the course / institution / org entity types (with a one /
// several / all scope for the list types), and a plain field for scalars and
// Canvas-course URLs (which the builder cannot enumerate without a live
// institution context).
function LiteralEditor({
  type,
  value,
  picker,
  onChange,
}: {
  type: string;
  value: string;
  picker: BuilderPickerData;
  onChange: (value: string) => void;
}) {
  const sx = { flex: 1, minWidth: 200 };

  if (type === "hubCourse") {
    const opts = picker.hubCourses ?? [];
    const missing = !!value && !opts.some((c) => c.id === value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.hubCourses === null ? "Loading courses..." : opts.length === 0 ? "No course tiles yet." : undefined}>
        <MenuItem value="">Choose a course tile</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((c) => (
          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "institution") {
    const missing = !!value && !picker.institutions.includes(value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}>
        <MenuItem value="">Choose an institution</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {picker.institutions.map((i) => (
          <MenuItem key={i} value={i}>{i}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "org") {
    const opts = picker.orgs ?? [];
    const missing = !!value && !opts.includes(value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.orgs === null ? "Loading organizations..." : opts.length === 0 ? "No organizations." : undefined}>
        <MenuItem value="">Choose an organization</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((o) => (
          <MenuItem key={o} value={o}>{o}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "hubCourseList") {
    return (
      <ScopePicker
        value={value}
        onChange={onChange}
        options={(picker.hubCourses ?? []).map((c) => ({ value: c.id, label: c.name }))}
        allLabel="All course tiles"
        loading={picker.hubCourses === null}
      />
    );
  }
  if (type === "orgList") {
    return (
      <ScopePicker
        value={value}
        onChange={onChange}
        options={(picker.orgs ?? []).map((o) => ({ value: o, label: o }))}
        allLabel="All organizations"
        loading={picker.orgs === null}
      />
    );
  }
  // lmsCourse / lmsCourseList / text / longtext / number: the builder has no
  // live-course list (that needs an institution + fetch), so a field is used.
  // Only the SCOPEABLE list type accepts "*" (all); a singular lmsCourse does
  // NOT expand "*" at run time, so its hint must not offer it.
  const lmsHint =
    type === "lmsCourseList"
      ? "Paste one Canvas course URL per line, or * for all courses at the institution."
      : type === "lmsCourse"
        ? "Paste the Canvas course URL."
        : undefined;
  return (
    <TextField
      size="small"
      type={type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={type === "lmsCourseList" ? "Canvas course URL(s); * = all" : type === "lmsCourse" ? "Canvas course URL" : undefined}
      helperText={lmsHint}
      sx={sx}
    />
  );
}

// One / several / all picker for a scopeable list literal: "All" stores the "*"
// sentinel (expanded at run time); otherwise a newline-joined subset.
function ScopePicker({
  value,
  onChange,
  options,
  allLabel,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  loading: boolean;
}) {
  const isAll = value.trim() === ALL_SCOPE;
  const selected = isAll ? [] : value.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 4 }}>
      <FormControlLabel
        control={
          <Checkbox size="small" checked={isAll} onChange={(e) => onChange(e.target.checked ? ALL_SCOPE : "")} />
        }
        label={allLabel}
      />
      {!isAll && (
        <Autocomplete
          multiple
          size="small"
          options={options.map((o) => o.value)}
          getOptionLabel={(v) => options.find((o) => o.value === v)?.label ?? v}
          value={selected}
          onChange={(_, v) => onChange(v.join("\n"))}
          loading={loading}
          renderInput={(params) => (
            <TextField {...params} size="small" placeholder={loading ? "Loading..." : "Select..."} />
          )}
        />
      )}
    </div>
  );
}
