// Server-side per-item grading diagnostic (docs/chat-grading-detailed-
// diagnostics-scope.md 4.4, WA). A PURE, IMPORT-FREE whitelist builder: it is
// PII-safe BY CONSTRUCTION. Its parameters are numbers, closed-union members,
// and exactly two provider/owner-set tokens (`model`, and a call's
// `finishReason`), each re-validated against a strict token pattern. There is
// no parameter that can carry a student name, file name, submission text,
// prompt, error message or token VALUE (only token COUNTS).

import type { GradeFailureClass } from "./grade-failure";

/** The only keys a diagnostic may ever carry. Pinned by the tests. */
export const GRADE_ITEM_DIAGNOSTIC_KEYS = [
  "serverMs",
  "prepMs",
  "gradeMs",
  "modelMs",
  "model",
  "passes",
  "promptTokens",
  "outputTokens",
  "finishReason",
  "failure",
] as const;

export type GradeItemDiagnosticKey = (typeof GRADE_ITEM_DIAGNOSTIC_KEYS)[number];

export interface GradeItemDiagnostic {
  serverMs?: number;
  prepMs?: number;
  gradeMs?: number;
  modelMs?: number;
  model?: string;
  passes?: number;
  promptTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  failure?: GradeFailureClass;
}

/** What the engine records about ONE callLlm invocation. Numbers only. */
export interface GradeCallRecord {
  /** HTTP status, set only when the call failed. */
  status?: number;
  finishReason?: string;
  promptTokens?: number;
  outputTokens?: number;
  elapsedMs?: number;
}

/**
 * The engine-facing sink. Both methods are total (they only push or assign), so
 * recording can never alter a grade.
 */
export interface GradeCallSink {
  recordCall(call: GradeCallRecord): void;
  recordFailure(failure: GradeFailureClass): void;
}

export interface GradeCallSinkState extends GradeCallSink {
  readonly calls: GradeCallRecord[];
  failure: GradeFailureClass | undefined;
}

export function createGradeCallSink(): GradeCallSinkState {
  const state: GradeCallSinkState = {
    calls: [],
    failure: undefined,
    recordCall(call) {
      state.calls.push(call);
    },
    recordFailure(failure) {
      state.failure = failure;
    },
  };
  return state;
}

export interface GradeItemDiagnosticInput {
  serverMs?: number;
  prepMs?: number;
  gradeMs?: number;
  /** Owner-set env value; validated against a token pattern, else omitted. */
  model?: string;
  calls?: readonly GradeCallRecord[];
  failure?: GradeFailureClass;
}

const MODEL_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FINISH_REASON_TOKEN = /^[A-Z_]{3,40}$/;

function cleanCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  const rounded = Math.round(value);
  return rounded <= 1e12 ? rounded : undefined;
}

/** Sum the defined, valid values; undefined when none were reported. */
function sumReported(values: ReadonlyArray<number | undefined>): number | undefined {
  let total = 0;
  let any = false;
  for (const v of values) {
    const c = cleanCount(v);
    if (c === undefined) continue;
    total += c;
    any = true;
  }
  return any ? total : undefined;
}

export function buildGradeItemDiagnostic(input: GradeItemDiagnosticInput): GradeItemDiagnostic {
  const out: GradeItemDiagnostic = {};
  const serverMs = cleanCount(input.serverMs);
  if (serverMs !== undefined) out.serverMs = serverMs;
  const prepMs = cleanCount(input.prepMs);
  if (prepMs !== undefined) out.prepMs = prepMs;
  const gradeMs = cleanCount(input.gradeMs);
  if (gradeMs !== undefined) out.gradeMs = gradeMs;

  const calls = input.calls ?? [];
  const modelMs = sumReported(calls.map((c) => c.elapsedMs));
  if (modelMs !== undefined) out.modelMs = modelMs;
  if (typeof input.model === "string" && MODEL_TOKEN.test(input.model)) out.model = input.model;
  out.passes = calls.length;
  const promptTokens = sumReported(calls.map((c) => c.promptTokens));
  if (promptTokens !== undefined) out.promptTokens = promptTokens;
  const outputTokens = sumReported(calls.map((c) => c.outputTokens));
  if (outputTokens !== undefined) out.outputTokens = outputTokens;

  const lastReason = calls.length > 0 ? calls[calls.length - 1].finishReason : undefined;
  if (typeof lastReason === "string" && FINISH_REASON_TOKEN.test(lastReason)) {
    out.finishReason = lastReason.toLowerCase();
  }
  if (input.failure !== undefined) out.failure = input.failure;
  return out;
}
