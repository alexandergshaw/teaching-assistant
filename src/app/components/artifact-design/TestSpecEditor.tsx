"use client";

import { TextField, MenuItem, FormControlLabel, Checkbox, Button, IconButton } from "@mui/material";
import {
  TECHNICAL_APTITUDES,
  TEST_FORMATS,
  TEST_MODES,
  TEST_QUESTION_KINDS,
  testTotalPoints,
  testQuestionCount,
  type TestSpec,
  type TestSectionSpec,
} from "@/lib/artifact-templates/types";
import ListFieldEditor from "./ListFieldEditor";

interface TestSpecEditorProps {
  spec: TestSpec;
  disabled: boolean;
  onChange: (next: TestSpec) => void;
}

export default function TestSpecEditor({ spec, disabled, onChange }: TestSpecEditorProps) {
  const set = <K extends keyof TestSpec>(key: K, value: TestSpec[K]) =>
    onChange({ ...spec, [key]: value });

  const setSection = (index: number, next: Partial<TestSectionSpec>) =>
    set(
      "sections",
      spec.sections.map((s, i) => (i === index ? { ...s, ...next } : s))
    );

  const aptitudeHint = TECHNICAL_APTITUDES.find((a) => a.value === spec.aptitude)?.hint ?? "";
  const formatHint = TEST_FORMATS.find((f) => f.value === spec.format)?.hint ?? "";
  const modeHint = TEST_MODES.find((m) => m.value === spec.mode)?.hint ?? "";

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
        helperText="What the test must measure."
      />

      <TextField
        label="Coverage"
        size="small"
        fullWidth
        multiline
        minRows={2}
        disabled={disabled}
        value={spec.coverage}
        onChange={(e) => set("coverage", e.target.value)}
        helperText="Which topics or weeks it draws from."
      />

      <TextField
        select
        label="Hands-on or written"
        size="small"
        fullWidth
        disabled={disabled}
        value={spec.mode}
        onChange={(e) => set("mode", e.target.value as TestSpec["mode"])}
        helperText={modeHint}
      >
        {TEST_MODES.map((m) => (
          <MenuItem key={m.value} value={m.value}>
            {m.label}
          </MenuItem>
        ))}
      </TextField>

      <div style={{ display: "flex", gap: "1rem" }}>
        <TextField
          select
          label="Technical aptitude"
          size="small"
          fullWidth
          disabled={disabled}
          value={spec.aptitude}
          onChange={(e) => set("aptitude", e.target.value as TestSpec["aptitude"])}
          helperText={aptitudeHint}
        >
          {TECHNICAL_APTITUDES.map((a) => (
            <MenuItem key={a.value} value={a.value}>
              {a.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Format"
          size="small"
          fullWidth
          disabled={disabled}
          value={spec.format}
          onChange={(e) => set("format", e.target.value as TestSpec["format"])}
          helperText={formatHint}
        >
          {TEST_FORMATS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Minutes"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.minutes}
          onChange={(e) => set("minutes", Math.max(0, Number(e.target.value) || 0))}
          helperText="Time allowed."
        />
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.5rem",
          }}
        >
          <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>Sections</h4>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {testQuestionCount(spec)} question(s), {testTotalPoints(spec)} point(s) total
          </span>
        </div>

        {spec.sections.length === 0 && (
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
            No sections yet - a test with no sections generates no questions.
          </div>
        )}

        {spec.sections.map((section, i) => (
          <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
            <TextField
              select
              label="Question kind"
              size="small"
              sx={{ flex: 2 }}
              disabled={disabled}
              value={section.kind}
              onChange={(e) => setSection(i, { kind: e.target.value as TestSectionSpec["kind"] })}
            >
              {TEST_QUESTION_KINDS.map((k) => (
                <MenuItem key={k.value} value={k.value}>
                  {k.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="How many"
              size="small"
              type="number"
              sx={{ flex: 1 }}
              disabled={disabled}
              value={section.count}
              // Counts must stay whole numbers: coerceTestSpec DROPS a section
              // whose count is not an integer, which would silently delete the
              // section on reload.
              onChange={(e) => setSection(i, { count: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
            <TextField
              label="Points each"
              size="small"
              type="number"
              sx={{ flex: 1 }}
              disabled={disabled}
              value={section.pointsEach}
              onChange={(e) => setSection(i, { pointsEach: Math.max(0, Number(e.target.value) || 0) })}
            />
            <IconButton
              size="small"
              disabled={disabled}
              aria-label="Remove section"
              onClick={() =>
                set(
                  "sections",
                  spec.sections.filter((_, index) => index !== i)
                )
              }
            >
              x
            </IconButton>
          </div>
        ))}

        <Button
          size="small"
          variant="outlined"
          disabled={disabled}
          sx={{ textTransform: "none" }}
          onClick={() =>
            set("sections", [...spec.sections, { kind: "multiple_choice", count: 5, pointsEach: 2 }])
          }
        >
          Add section
        </Button>
      </div>

      <ListFieldEditor
        label="Allowed resources"
        helperText='What students may use, e.g. "open book". One per line.'
        disabled={disabled}
        items={spec.allowedResources}
        onChange={(items) => set("allowedResources", items)}
      />

      <div style={{ display: "flex", gap: "1.5rem" }}>
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={spec.includeAnswerKey}
              onChange={(e) => set("includeAnswerKey", e.target.checked)}
            />
          }
          label="Include an answer key"
        />
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={spec.includeStudyGuide}
              onChange={(e) => set("includeStudyGuide", e.target.checked)}
            />
          }
          label="Include a study guide"
        />
      </div>
    </div>
  );
}
