import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

export const MAX_HOMEWORK_CHARS = 20_000;

export interface ObjectiveDraft {
  id: string;
  text: string;
  selected: boolean;
}

export function makeObjectiveDraft(objectives: string[]): ObjectiveDraft[] {
  return objectives.map((text, index) => ({ id: `${Date.now()}-${index}`, text, selected: true }));
}

export function selectedObjectiveTexts(drafts: ObjectiveDraft[]): string[] {
  return drafts.map((draft) => draft.text.trim()).filter((text, index) => drafts[index].selected && text.length > 0);
}

export function validateHomework(homework: string): string | null {
  if (!homework.trim()) return "Paste the homework before generating objectives.";
  if (homework.length > MAX_HOMEWORK_CHARS) return `Homework must be ${MAX_HOMEWORK_CHARS.toLocaleString()} characters or fewer.`;
  return null;
}

export function objectiveGenerationResult(homeworkAtStart: string, currentHomework: string, objectives: string[] | null): { kind: "success"; objectives: string[] } | { kind: "stale" | "failure" } {
  if (homeworkAtStart !== currentHomework) return { kind: "stale" };
  if (!objectives?.length) return { kind: "failure" };
  return { kind: "success", objectives };
}

/** Prevent a response computed under an older applied-objective set from becoming current. */
export function isObjectiveRevisionCurrent(startRevision: number, currentRevision: number): boolean {
  return startRevision === currentRevision;
}
export type PipelineDiagnosticOperation =
  | "pipeline_objective_generation"
  | "pipeline_objectives_apply"
  | "pipeline_objectives_clear"
  | "pipeline_slide_regeneration"
  | "pipeline_slide_save"
  | "pipeline_slide_candidate_accept"
  | "pipeline_slide_candidate_discard";

export function recordPipelineDiagnostic(operation: PipelineDiagnosticOperation, outcome: "success" | "failure", durationMs: number, count = 0, invalidated = 0, code?: "INVALID_INPUT" | "MODEL_RESPONSE" | "NETWORK" | "STALE", writer = recordSessionDiagnosticEntry) {
  try {
    writer({
      at: new Date().toISOString(), surface: "templates", operation, label: "Slide Deck Pipeline", institution: "", course: "", outcome,
      durationMs: Math.max(0, Number.isFinite(durationMs) ? durationMs : 0), code,
      detail: { count: Math.max(0, Math.floor(count)), invalidated: Math.max(0, Math.floor(invalidated)) },
    });
  } catch { /* Diagnostics must not interrupt editing. */ }
}
