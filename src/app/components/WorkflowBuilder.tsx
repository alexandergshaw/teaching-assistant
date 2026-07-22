"use client";

import { useMemo, useState } from "react";
import { Autocomplete, Button, TextField, createFilterOptions } from "@mui/material";
import Typeahead from "./ui/Typeahead";
import {
  type WorkflowDef,
  type WorkflowStepConfig,
  type InputBinding,
  expandWorkflowDef,
} from "@/lib/workflows/types";
import {
  STEP_REGISTRY,
  getStepDefinition,
} from "@/lib/workflows/registry";
import {
  stepCategory,
  stepCategoryLabel,
  stepCategoryOrderIndex,
} from "@/lib/workflows/step-categories";
import styles from "../page.module.css";
import {
  type BuilderPickerData,
  type ActionOption,
  normalizeBindings,
  remapStepReferences,
} from "./workflows/builder/builder-shared";
import StepCard from "./workflows/builder/StepCard";

// Match a typed query against the action's name, description, and type slug -
// not just its name - so searching "grade" or "rubric" surfaces everything.
const filterActions = createFilterOptions<ActionOption>({
  stringify: (o) => `${o.name} ${o.description} ${o.type} ${o.categoryLabel}`,
});

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
  const [expandedIncludeStep, setExpandedIncludeStep] = useState<number | null>(null);

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

  const handleRunIfChange = (
    stepIndex: number,
    binding: InputBinding | null,
    expected: boolean
  ) => {
    const next = {
      ...def,
      steps: def.steps.map((s, i) =>
        i === stepIndex ? { ...s, runIf: binding ? { binding, expected } : undefined } : s
      ),
    };
    onChange(next);
  };

  const handleIncludeChange = (stepIndex: number, include: NonNullable<WorkflowStepConfig["include"]>) => {
    const source = others.find((w) => w.id === include.workflowId);
    if (!source) return;

    const candidate: WorkflowDef = {
      ...def,
      steps: def.steps.map((s, i) =>
        i === stepIndex ? { ...s, include } : s
      ),
    };

    const allDefs = [...others, candidate];
    const lookup = (id: string): WorkflowDef | undefined => {
      return allDefs.find((w) => w.id === id);
    };

    try {
      expandWorkflowDef(candidate, lookup);
      setIncludeError("");
      onChange(candidate);
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
            onRunIfChange={handleRunIfChange}
            onIncludeChange={handleIncludeChange}
            expandedIncludeStep={expandedIncludeStep}
            setExpandedIncludeStep={setExpandedIncludeStep}
            others={others}
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
          workflow steps as they are at run time - later edits apply here). Open an included workflow&apos;s Choose steps to mirror only some of its steps and wire replacements for the outputs of skipped ones.
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

export type { BuilderPickerData } from "./workflows/builder/builder-shared";

