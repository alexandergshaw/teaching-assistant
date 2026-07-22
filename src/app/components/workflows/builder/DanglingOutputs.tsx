"use client";

import { MenuItem, TextField } from "@mui/material";
import {
  type WorkflowStepConfig,
  type InputBinding,
  outputFeedsInput,
  LITERAL_CAPABLE_TYPES,
} from "@/lib/workflows/types";
import { getStepDefinition } from "@/lib/workflows/registry";
import {
  danglingOutputs,
} from "@/lib/workflows/include-mirror";
import LiteralEditor from "./LiteralEditor";
import { type BuilderPickerData } from "./builder-shared";

function DanglingOutputRows({
  sourceSteps,
  skipSteps,
  include,
  stepIndex,
  allSteps,
  picker,
  onRemapChange,
}: {
  sourceSteps: WorkflowStepConfig[];
  skipSteps: number[];
  include: NonNullable<WorkflowStepConfig["include"]>;
  stepIndex: number;
  allSteps: WorkflowStepConfig[];
  picker: BuilderPickerData;
  onRemapChange: (key: string, binding: InputBinding | null) => void;
}) {
  const dangling = danglingOutputs(sourceSteps, skipSteps, getStepDefinition);

  if (dangling.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--field-border)" }}>
      <div style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: 8 }}>
        Wire outputs from skipped steps:
      </div>
      {dangling.map((d) => (
        <DanglingOutputRow
          key={d.key}
          danglingOutput={d}
          include={include}
          includeStepIndex={stepIndex}
          allSteps={allSteps}
          picker={picker}
          onRemapChange={(binding) => onRemapChange(d.key, binding)}
        />
      ))}
    </div>
  );
}

// A single row for wiring a dangling output from a skipped source step.
function DanglingOutputRow({
  danglingOutput,
  include,
  includeStepIndex,
  allSteps,
  picker,
  onRemapChange,
}: {
  danglingOutput: ReturnType<typeof danglingOutputs>[0];
  include: NonNullable<WorkflowStepConfig["include"]>;
  includeStepIndex: number;
  allSteps: WorkflowStepConfig[];
  picker: BuilderPickerData;
  onRemapChange: (binding: InputBinding | null) => void;
}) {
  const currentRemap = include.remap[danglingOutput.key];
  let currentSource: "runtime" | "step" | "literal" = "runtime";
  let currentStepIndex: number | undefined;
  let currentOutputKey: string | undefined;
  let currentLiteralValue = "";

  if (currentRemap?.source === "step") {
    currentSource = "step";
    currentStepIndex = currentRemap.stepIndex;
    currentOutputKey = currentRemap.outputKey;
  } else if (currentRemap?.source === "literal") {
    currentSource = "literal";
    currentLiteralValue = currentRemap.value;
  }

  // Find compatible outputs from earlier steps in the including workflow
  const compatibleStepOutputs: Array<{
    stepIndex: number;
    outputKey: string;
    label: string;
  }> = [];

  for (let j = 0; j < includeStepIndex; j++) {
    const stepDef = getStepDefinition(allSteps[j].type);
    if (!stepDef) continue;
    for (const output of stepDef.outputs) {
      if (outputFeedsInput(output.type, danglingOutput.outputType)) {
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

  if (LITERAL_CAPABLE_TYPES.has(danglingOutput.outputType)) {
    options.push({
      value: "literal",
      label: ["text", "longtext", "number", "concepts"].includes(danglingOutput.outputType) ? "Fixed value" : "Preset value",
    });
  } else if (danglingOutput.outputType === "files") {
    options.push({
      value: "literal",
      label: "Fixed value (empty - step skips itself)",
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
        <label style={{ flex: 0, minWidth: "200px", fontSize: "0.85rem" }}>
          Source step {danglingOutput.droppedIndex + 1}&apos;s&nbsp;{danglingOutput.outputLabel} comes from
        </label>
        <TextField
          select
          size="small"
          value={selectValue}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "runtime") {
              onRemapChange(null);
            } else if (val === "literal") {
              onRemapChange({ source: "literal", value: currentLiteralValue });
            } else if (val.startsWith("step:")) {
              const parts = val.split(":");
              const j = Number(parts[1]);
              const k = parts.slice(2).join(":");
              onRemapChange({ source: "step", stepIndex: j, outputKey: k });
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

        {currentSource === "literal" && danglingOutput.outputType !== "files" && (
          <LiteralEditor
            type={danglingOutput.outputType}
            value={currentLiteralValue}
            picker={picker}
            onChange={(v) => onRemapChange({ source: "literal", value: v })}
          />
        )}
      </div>
    </div>
  );
}

export { DanglingOutputRows, DanglingOutputRow };
export default DanglingOutputRows;
