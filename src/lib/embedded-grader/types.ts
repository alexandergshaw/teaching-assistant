/**
 * Types for the Embedded Deterministic Engine: an in-process grader that needs
 * no external service, no API key, and no LLM. A rubric is a list of concrete,
 * mechanically-checkable requirements; grading runs each check against a
 * submission and awards its points. The same submission always scores the same.
 */

export type CheckType =
  | "keyword" // a single required term must appear in the submission text
  | "all_keywords" // every term must appear (partial credit by fraction present)
  | "any_keywords" // at least one of the terms must appear
  | "min_words" // submission word count must meet a threshold
  | "file_type" // a file with the target extension must be submitted
  | "min_file_count" // at least N files must be submitted
  | "regex" // the submission text must match a pattern
  | "code_symbol"; // a function/class/method with the target name must be defined

export interface RubricCheck {
  id: string;
  /** Human-readable criterion name, shown as a column in the results matrix. */
  criterion: string;
  checkType: CheckType;
  /** Primary argument: the term, file extension, symbol name, or pattern. */
  target: string;
  /** Term list for all_keywords / any_keywords. */
  terms?: string[];
  /** Threshold for min_words / min_file_count. */
  count?: number;
  /** Pattern for regex checks (defaults to `target` when omitted). */
  pattern?: string;
  /** Points this criterion is worth. */
  points: number;
}

export interface EmbeddedRubric {
  checks: RubricCheck[];
  /**
   * Where the rubric came from:
   * - "checks": a structured check-based rubric was supplied (JSON).
   * - "rubric": a free-text / criteria rubric was supplied and mapped to checks.
   * - "instructions": no rubric was supplied, so it was generated from the brief.
   */
  origin: "checks" | "rubric" | "instructions";
  /** Notes surfaced to the instructor (e.g. heuristic mapping was used). */
  warnings: string[];
}
