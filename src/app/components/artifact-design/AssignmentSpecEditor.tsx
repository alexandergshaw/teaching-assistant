"use client";

import { TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import {
  TECHNICAL_APTITUDES,
  GROUPINGS,
  type AssignmentSpec,
} from "@/lib/artifact-templates/types";
import ListFieldEditor from "./ListFieldEditor";

interface AssignmentSpecEditorProps {
  spec: AssignmentSpec;
  disabled: boolean;
  onChange: (next: AssignmentSpec) => void;
}

export default function AssignmentSpecEditor({ spec, disabled, onChange }: AssignmentSpecEditorProps) {
  const set = <K extends keyof AssignmentSpec>(key: K, value: AssignmentSpec[K]) =>
    onChange({ ...spec, [key]: value });

  const aptitudeHint = TECHNICAL_APTITUDES.find((a) => a.value === spec.aptitude)?.hint ?? "";
  const groupingHint = GROUPINGS.find((g) => g.value === spec.grouping)?.hint ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <TextField
        label="Goal"
        size="small"
        fullWidth
        multiline
        minRows={2}
        disabled={disabled}
        value={spec.goal}
        onChange={(e) => set("goal", e.target.value)}
        helperText="What the student should achieve."
      />

      <TextField
        label="Activity"
        size="small"
        fullWidth
        multiline
        minRows={2}
        disabled={disabled}
        value={spec.activity}
        onChange={(e) => set("activity", e.target.value)}
        helperText="What they actually do."
      />

      <div style={{ display: "flex", gap: "1rem" }}>
        <TextField
          select
          label="Technical aptitude"
          size="small"
          fullWidth
          disabled={disabled}
          value={spec.aptitude}
          onChange={(e) => set("aptitude", e.target.value as AssignmentSpec["aptitude"])}
          helperText={aptitudeHint}
        >
          {TECHNICAL_APTITUDES.map((a) => (
            <MenuItem key={a.value} value={a.value}>
              {a.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Expected minutes"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.minutes}
          onChange={(e) => set("minutes", Math.max(0, Number(e.target.value) || 0))}
          helperText="Time to complete."
        />
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <TextField
          select
          label="Grouping"
          size="small"
          fullWidth
          disabled={disabled}
          value={spec.grouping}
          onChange={(e) => set("grouping", e.target.value as AssignmentSpec["grouping"])}
          helperText={groupingHint}
        >
          {GROUPINGS.map((g) => (
            <MenuItem key={g.value} value={g.value}>
              {g.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Group size"
          size="small"
          type="number"
          fullWidth
          // Group size only means anything for group work - the spec documents
          // it as "only meaningful when grouping === group".
          disabled={disabled || spec.grouping !== "group"}
          value={spec.groupSize ?? ""}
          onChange={(e) =>
            set("groupSize", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))
          }
          helperText={spec.grouping === "group" ? "Students per group." : "Group work only."}
        />
      </div>

      <ListFieldEditor
        label="Deliverables"
        helperText="What the student hands in. One per line."
        disabled={disabled}
        items={spec.deliverables}
        onChange={(items) => set("deliverables", items)}
      />

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={spec.includeOpener}
              onChange={(e) => set("includeOpener", e.target.checked)}
            />
          }
          label="In-class opener"
        />
        <TextField
          label="Opener minutes"
          size="small"
          type="number"
          disabled={disabled || !spec.includeOpener}
          value={spec.openerMinutes ?? ""}
          onChange={(e) =>
            set("openerMinutes", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))
          }
        />
      </div>

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={spec.includeCloser}
              onChange={(e) => set("includeCloser", e.target.checked)}
            />
          }
          label="In-class closer"
        />
        <TextField
          label="Closer minutes"
          size="small"
          type="number"
          disabled={disabled || !spec.includeCloser}
          value={spec.closerMinutes ?? ""}
          onChange={(e) =>
            set("closerMinutes", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))
          }
        />
      </div>
    </div>
  );
}
