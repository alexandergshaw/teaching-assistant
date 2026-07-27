"use client";

import { TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import {
  TECHNICAL_APTITUDES,
  TEST_QUESTION_KINDS,
  CLASS_SESSION_VARIANTS,
  type ClassSessionSpec,
} from "@/lib/artifact-templates/types";

interface ClassSessionSpecEditorProps {
  spec: ClassSessionSpec;
  disabled: boolean;
  onChange: (next: ClassSessionSpec) => void;
}

export default function ClassSessionSpecEditor({ spec, disabled, onChange }: ClassSessionSpecEditorProps) {
  const set = <K extends keyof ClassSessionSpec>(key: K, value: ClassSessionSpec[K]) =>
    onChange({ ...spec, [key]: value });

  const setAssignment = (patch: Partial<ClassSessionSpec["assignment"]>) =>
    onChange({ ...spec, assignment: { ...spec.assignment, ...patch } });
  const setDiscussion = (patch: Partial<ClassSessionSpec["discussion"]>) =>
    onChange({ ...spec, discussion: { ...spec.discussion, ...patch } });
  const setQuiz = (patch: Partial<ClassSessionSpec["quiz"]>) =>
    onChange({ ...spec, quiz: { ...spec.quiz, ...patch } });

  const variantHint = CLASS_SESSION_VARIANTS.find((v) => v.value === spec.variant)?.hint ?? "";
  const aptitudeHint =
    TECHNICAL_APTITUDES.find((a) => a.value === spec.assignment.aptitude)?.hint ?? "";

  const heading = (text: string) => (
    <h4 style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", fontWeight: 600 }}>{text}</h4>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <TextField
        select
        label="Course type"
        size="small"
        fullWidth
        disabled={disabled}
        value={spec.variant}
        onChange={(e) => set("variant", e.target.value as ClassSessionSpec["variant"])}
        helperText={variantHint}
      >
        {CLASS_SESSION_VARIANTS.map((v) => (
          <MenuItem key={v.value} value={v.value}>
            {v.label}
          </MenuItem>
        ))}
      </TextField>

      {heading("Case study")}
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={spec.includeCaseStudy}
              onChange={(e) => set("includeCaseStudy", e.target.checked)}
            />
          }
          label="Research a recent case study"
        />
        <TextField
          label="How recent"
          size="small"
          fullWidth
          disabled={disabled || !spec.includeCaseStudy}
          value={spec.caseStudyWindow}
          onChange={(e) => set("caseStudyWindow", e.target.value)}
          helperText="e.g. the past 30 days"
        />
      </div>

      {heading("Discussion board post")}
      <TextField
        label="Discussion prompt"
        size="small"
        fullWidth
        multiline
        minRows={2}
        disabled={disabled}
        value={spec.discussion.prompt}
        onChange={(e) => setDiscussion({ prompt: e.target.value })}
        helperText="Blank asks students to respond to the week's case study."
      />
      <div style={{ display: "flex", gap: "1rem" }}>
        <TextField
          label="Minimum words"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.discussion.postMinWords}
          onChange={(e) => setDiscussion({ postMinWords: Math.max(0, Number(e.target.value) || 0) })}
        />
        <TextField
          label="Required replies"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.discussion.requiredReplies}
          onChange={(e) => setDiscussion({ requiredReplies: Math.max(0, Number(e.target.value) || 0) })}
        />
        <TextField
          label="Points"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.discussion.points}
          onChange={(e) => setDiscussion({ points: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>

      {heading("Hands-on assignment")}
      <TextField
        label="Goal"
        size="small"
        fullWidth
        multiline
        minRows={2}
        disabled={disabled}
        value={spec.assignment.goal}
        onChange={(e) => setAssignment({ goal: e.target.value })}
      />
      <div style={{ display: "flex", gap: "1rem" }}>
        <TextField
          select
          label="Technical aptitude"
          size="small"
          fullWidth
          disabled={disabled}
          value={spec.assignment.aptitude}
          onChange={(e) =>
            setAssignment({ aptitude: e.target.value as ClassSessionSpec["assignment"]["aptitude"] })
          }
          helperText={aptitudeHint}
        >
          {TECHNICAL_APTITUDES.map((a) => (
            <MenuItem key={a.value} value={a.value}>
              {a.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Minutes"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.assignment.minutes}
          onChange={(e) => setAssignment({ minutes: Math.max(0, Number(e.target.value) || 0) })}
        />
        <TextField
          label="Points"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.assignment.points}
          onChange={(e) => setAssignment({ points: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={spec.assignment.buildsTowardProject}
              onChange={(e) => setAssignment({ buildsTowardProject: e.target.checked })}
            />
          }
          label="Builds toward a semester project"
          sx={{ whiteSpace: "nowrap" }}
        />
        <TextField
          label="Semester project"
          size="small"
          fullWidth
          multiline
          minRows={2}
          disabled={disabled || !spec.assignment.buildsTowardProject}
          value={spec.assignment.projectDescription}
          onChange={(e) => setAssignment({ projectDescription: e.target.value })}
          helperText="What the weekly increments add up to by the end of the term."
        />
      </div>

      {heading("Quiz")}
      <div style={{ display: "flex", gap: "1rem" }}>
        <TextField
          label="Questions"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.quiz.questionCount}
          onChange={(e) => setQuiz({ questionCount: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
        />
        <TextField
          label="Points each"
          size="small"
          type="number"
          fullWidth
          disabled={disabled}
          value={spec.quiz.pointsEach}
          onChange={(e) => setQuiz({ pointsEach: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>
      <TextField
        select
        label="Question kinds"
        size="small"
        fullWidth
        disabled={disabled}
        value={spec.quiz.kinds}
        slotProps={{ select: { multiple: true } }}
        onChange={(e) => {
          const raw = e.target.value as unknown as string[];
          const kinds = TEST_QUESTION_KINDS.filter((k) => raw.includes(k.value)).map((k) => k.value);
          // An empty selection would mean a quiz with no answerable question
          // kind, and the spec coercion would silently replace it on reload -
          // so the last kind cannot be removed.
          if (kinds.length > 0) setQuiz({ kinds });
        }}
        helperText="Questions are split as evenly as possible across the kinds you pick."
      >
        {TEST_QUESTION_KINDS.map((k) => (
          <MenuItem key={k.value} value={k.value}>
            {k.label}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
}
