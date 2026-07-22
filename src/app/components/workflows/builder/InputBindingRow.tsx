"use client";

import { MenuItem, TextField } from "@mui/material";
import {
  type StepInputSpec,
  type InputBinding,
  type WorkflowScope,
  scopeCoversType,
  scopeFamilyForType,
  outputFeedsInput,
  LITERAL_CAPABLE_TYPES,
  isModuleType,
} from "@/lib/workflows/types";
import { type StepDefinition } from "@/lib/workflows/registry";
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
  onBindingChange,
  picker,
  scope,
  courseScoped,
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
  courseScoped?: boolean;
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
          ) : input.options && input.options.length > 0 ? (
            <OptionsSelect
              options={input.options}
              multi={input.multi}
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
        <div style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2, marginLeft: 128, maxWidth: 560 }}>
          {input.help}
        </div>
      )}
      {showScopeOption && currentSource === "runtime" && (
        <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: 2, marginLeft: 128 }}>
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

// Edits a literal value as a select over a fixed option list. Multi-select
// stores the chosen options newline-joined (what the step reads as text).
function OptionsSelect({
  options,
  multi,
  value,
  onChange,
}: {
  options: string[];
  multi?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (multi) {
    return (
      <TextField
        select
        size="small"
        value={selected}
        onChange={(e) => {
          const next = e.target.value as unknown as string[];
          onChange(next.join("\n"));
        }}
        sx={{ flex: 1, minWidth: 200 }}
        slotProps={{ select: { multiple: true, renderValue: (sel: unknown) => (sel as string[]).join(", ") || "Choose options" } }}
      >
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {opt}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  return (
    <TextField
      select
      size="small"
      value={selected[0] ?? ""}
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

export { InputBindingRow, TileRefPicker, OptionsSelect };
export default InputBindingRow;
