"use client";

import { MenuItem, TextField } from "@mui/material";
import {
  type StepInputSpec,
  type InputBinding,
  type WorkflowScope,
  type WorkflowStepConfig,
  scopeCoversType,
  scopeFamilyForType,
  outputFeedsInput,
  LITERAL_CAPABLE_TYPES,
  isModuleType,
} from "@/lib/workflows/types";
import { type StepDefinition } from "@/lib/workflows/registry";
import { usesMultiSelect } from "@/lib/multi-select-value";
import LiteralEditor from "./LiteralEditor";
import { type BuilderPickerData } from "./builder-shared";
import { inheritedScopeSummary } from "./StepCard";

function TileRefPicker({
  value,
  onChange,
  picker,
  sentinel,
  helperText,
}: {
  value: string;
  onChange: (value: string) => void;
  picker: BuilderPickerData;
  sentinel: string;
  helperText: string;
}) {
  const prefix = `${sentinel}:`;
  const tileId = value.trim().startsWith(prefix) ? value.trim().slice(prefix.length) : "";
  const opts = picker.hubCourses ?? [];
  return (
    <TextField
      select
      size="small"
      value={tileId}
      onChange={(e) => onChange(e.target.value ? `${sentinel}:${e.target.value}` : sentinel)}
      sx={{ flex: 1, minWidth: 200 }}
      helperText={helperText}
    >
      <MenuItem value="">Workflow-scoped course tile</MenuItem>
      {opts.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

function InputBindingRow({
  stepIndex,
  input,
  binding,
  allStepDefs,
  allSteps,
  onBindingChange,
  picker,
  scope,
  courseScoped,
}: {
  stepIndex: number;
  input: StepInputSpec;
  binding: InputBinding | undefined;
  allStepDefs: (StepDefinition | undefined)[];
  // The raw step configs backing allStepDefs (same order) - needed to
  // resolve an id-bound binding's stepId to its position, since a def's ids
  // live on WorkflowStepConfig, not on the step DEFINITION.
  allSteps: WorkflowStepConfig[];
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
  courseScoped?: boolean;
}) {
  let currentSource: "runtime" | "step" | "literal" = "runtime";
  let currentStepIndex: number | undefined;
  let currentOutputKey: string | undefined;
  let currentLiteralValue = "";

  if (binding?.source === "step") {
    currentSource = "step";
    // An id-bound binding resolves to the step it names so the matching
    // "Step N output" option shows as selected - reading `.stepIndex`
    // directly on an id binding is `undefined`, which used to fall through
    // to "Ask when running" and lie to the instructor about what is
    // actually wired. See CHUNK E-a2.
    currentStepIndex =
      "stepIndex" in binding
        ? binding.stepIndex
        : allSteps.findIndex((s) => s.id === binding.stepId);
    if (currentStepIndex === -1) currentStepIndex = undefined;
    currentOutputKey = binding.outputKey;
  } else if (binding?.source === "literal") {
    currentSource = "literal";
    currentLiteralValue = binding.value;
  }

  const scopeCovered = scopeCoversType(scope, input.type);
  const scopeFamily = scopeFamilyForType(input.type);
  const isScopeable = scopeFamily !== null;
  const scopeFamilyValue = scopeFamily && scope ? (scope[scopeFamily] ?? "").trim() : "";
  const moduleFromScope = (isModuleType(input.type) || !!input.courseDerived) && !!courseScoped;
  const showScopeOption = isScopeable || moduleFromScope;

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
    { value: "runtime", label: showScopeOption ? "From workflow scope" : "Ask when running" },
    ...compatibleStepOutputs.map((o) => ({
      value: `step:${o.stepIndex}:${o.outputKey}`,
      label: o.label,
    })),
  ];

  // A preset ("fixed value") is offered for scalars AND the course /
  // institution / org entity types, so a workflow can hard-set the target and
  // run unmonitored. Entity presets get a real picker below (one / several /
  // all for the list types).
  if (LITERAL_CAPABLE_TYPES.has(input.type)) {
    options.push({
      value: "literal",
      label: ["text", "longtext", "number", "concepts"].includes(input.type) ? "Fixed value" : "Preset value",
    });
  }

  if (input.type === "repo") {
    options.push({ value: "classrepo", label: "Reference Class Repository Tile" });
  }

  if (input.type === "lmsCourse" || input.type === "date" || input.type === "institution") {
    options.push({ value: "classtile", label: "Reference Class Tile" });
  }
  // "time" is deliberately NOT added alongside "date" here (docs/
  // announcement-post-time-acceptance-criteria.md T1.3): "Reference Class
  // Tile" resolves at run time to a FIELD ON THE COURSE TILE - its start
  // date, its Canvas URL, its institution - and a course tile has no
  // "time of day" field for a time input to reference. Falling through to
  // the generic literal branch below (LiteralEditor's own new "time" case)
  // is therefore the correct behavior, not an oversight.

  const isClassRepoRef =
    currentSource === "literal" && currentLiteralValue.trim().startsWith("@class-repo");

  const isClassTileRef =
    currentSource === "literal" && currentLiteralValue.trim().startsWith("@class-tile");

  const selectValue =
    currentSource === "step" && currentStepIndex !== undefined
      ? `step:${currentStepIndex}:${currentOutputKey}`
      : isClassRepoRef
        ? "classrepo"
        : isClassTileRef
          ? "classtile"
          : currentSource === "literal"
            ? "literal"
            : "runtime";

  return (
    <div style={{ marginBottom: "var(--space-3)" }}>
      <div style={{ marginBottom: 0, display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <label style={{ flex: 0, minWidth: "120px", fontSize: "var(--font-size-md)" }}>
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
            } else if (val === "classrepo") {
              onBindingChange(stepIndex, input.key, "literal", undefined, undefined, "@class-repo");
            } else if (val === "classtile") {
              onBindingChange(stepIndex, input.key, "literal", undefined, undefined, "@class-tile");
            } else if (val === "literal") {
              const seed = currentLiteralValue.trim().startsWith("@class-") ? "" : currentLiteralValue;
              onBindingChange(stepIndex, input.key, "literal", undefined, undefined, seed);
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

        {currentSource === "literal" &&
          (isClassRepoRef ? (
            <TileRefPicker
              value={currentLiteralValue}
              picker={picker}
              sentinel="@class-repo"
              helperText="Uses the tile's first linked repository at run time."
              onChange={(v) =>
                onBindingChange(stepIndex, input.key, "literal", undefined, undefined, v)
              }
            />
          ) : isClassTileRef ? (
            <TileRefPicker
              value={currentLiteralValue}
              picker={picker}
              sentinel="@class-tile"
              helperText="Uses this course tile's matching field at run time."
              onChange={(v) =>
                onBindingChange(stepIndex, input.key, "literal", undefined, undefined, v)
              }
            />
          ) : usesMultiSelect(input) ? (
            // options AND multi both set (e.g. course-build's "outputs",
            // messaging's "instructions") - LiteralEditor's own multi-select
            // branch (reuses multi-select-value.ts, matches the run form's
            // Autocomplete exactly). Checked before the options-only branch
            // below so a multi field never reaches OptionsSelect, which
            // implements single-select only (its multi-select branch was
            // unreachable dead code - this ternary already intercepts every
            // multi field first - and has been removed; see OptionsSelect
            // below).
            <LiteralEditor
              type={input.type}
              value={currentLiteralValue}
              picker={picker}
              options={input.options}
              multi={input.multi}
              onChange={(v) =>
                onBindingChange(stepIndex, input.key, "literal", undefined, undefined, v)
              }
            />
          ) : input.options && input.options.length > 0 ? (
            <OptionsSelect
              options={input.options}
              value={currentLiteralValue}
              onChange={(v) =>
                onBindingChange(stepIndex, input.key, "literal", undefined, undefined, v)
              }
            />
          ) : (
            <LiteralEditor
              type={input.type}
              value={currentLiteralValue}
              picker={picker}
              onChange={(v) =>
                onBindingChange(stepIndex, input.key, "literal", undefined, undefined, v)
              }
            />
          ))}
      </div>
      {input.help && (
        <div style={{ fontSize: "var(--font-size-xs)", opacity: 0.6, marginTop: "var(--space-1)", marginLeft: 128, maxWidth: 560 }}>
          {input.help}
        </div>
      )}
      {showScopeOption && currentSource === "runtime" && (
        <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.7, marginTop: "var(--space-1)", marginLeft: 128 }}>
          {(() => {
            if (moduleFromScope && !isScopeable) {
              return "Taken from the workflow's scoped course.";
            }
            if (!scopeCovered) {
              if (scopeFamilyValue === "*") {
                return "The workflow scope targets all - this single field is asked at run time.";
              }
              return "From the workflow scope (set under Build) - asks at run time if unset.";
            }
            const summary = inheritedScopeSummary(input.type, scope, picker);
            return summary ? `Set by workflow scope: ${summary}` : "Set by workflow scope";
          })()}
        </div>
      )}
    </div>
  );
}

// Pulls the single selected option out of a literal's stored string: the
// first trimmed, non-blank line, or "" if there isn't one. Pulled out as a
// named function (rather than left inline in OptionsSelect) so it is
// unit-testable - this repo has no React Testing Library and no .tsx test
// files, so OptionsSelect's own rendering can't be exercised directly.
export function firstSelectedOption(value: string): string {
  return value.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "";
}

// Edits a literal value as a select over a fixed option list (single-select
// only). Not exported: its sole call site is the options-without-multi
// branch above, which never passes a multi field here (usesMultiSelect
// intercepts those first, routing them to LiteralEditor's Autocomplete
// instead). This component used to also carry its own multi-select branch
// (a second, duplicate newline split/join implementation of the format
// src/lib/multi-select-value.ts owns) but that branch was unreachable - the
// only place that ever called this component always passes a field whose
// `multi` is falsy - so it has been removed rather than fixed in place.
function OptionsSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      value={firstSelectedOption(value)}
      onChange={(e) => onChange(e.target.value)}
      sx={{ flex: 1, minWidth: 200 }}
    >
      {options.map((opt) => (
        <MenuItem key={opt} value={opt}>
          {opt}
        </MenuItem>
      ))}
    </TextField>
  );
}

export { InputBindingRow, TileRefPicker };
export default InputBindingRow;
