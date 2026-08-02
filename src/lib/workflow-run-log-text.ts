// Pure formatter for the downloadable plain-text workflow run log.
//
// WorkflowRunRecord/WorkflowRunStep are imported type-only from
// workflow-runs.ts, so the import erases at compile time and this module
// carries no runtime dependency on the Supabase client - it is unit-testable
// directly, with no database involved (mirrors the AnswerLink type-only
// import pattern documented in live-class-sessions.ts).
//
// Deterministic by construction: this module never calls Date.now(), new
// Date(), Math.random(), or any other source of ambient state. Every value
// it renders comes from its arguments. Timestamps ARE parsed (Date.parse /
// new Date(iso)) to render a human-readable form and to sort steps
// chronologically, but every read from the resulting Date object uses its
// UTC getters (getUTCFullYear, getUTCHours, ...) and a hand-written month
// name table - never toLocaleString/Intl and never the local getters
// (getFullYear, getHours, ...). That is what keeps a test asserting
// formatted output from breaking on a machine in a different timezone: an
// ISO string with an explicit offset names one exact instant, and reading
// its UTC fields back out is the one path that names the same wall-clock
// text everywhere, regardless of the host's local zone or ICU locale data.

import type { WorkflowRunRecord, WorkflowRunStep } from "./workflow-runs";

// A .txt download gets no markdown and no box-drawing (mangles in Notepad) -
// a repeated plain ASCII character is the only "divider" that renders
// identically everywhere. One fixed width, used consistently: MAJOR_RULE
// brackets each step (and the run header/steps sections), MINOR_RULE
// separates a step's own metadata / progress / summary / error groups.
const RULE_WIDTH = 80;
const MAJOR_RULE = "=".repeat(RULE_WIDTH);
const MINOR_RULE = "-".repeat(RULE_WIDTH);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Deterministic, timezone-stable human rendering of an ISO instant. Reads
 * only the parsed Date's UTC fields (see this module's header comment for
 * why) - never Intl/toLocaleString, whose output can vary by the host's ICU
 * data or OS locale even when the instant and requested zone are pinned.
 * Null on an unparseable string, so the caller can fall back to the raw
 * value alone rather than printing "Invalid Date". */
function formatHumanTimestamp(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const month = MONTH_NAMES[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${month} ${day}, ${year} ${hh}:${mm}:${ss} UTC`;
}

/** A human-readable rendering PLUS the exact raw value in parens - this is
 * also evidence (AC5: nothing currently in the log may be lost), so the
 * precise ISO-with-offset string a reader might need to diff or paste
 * elsewhere always stays present verbatim alongside the readable form. */
function formatTimestamp(value: string | null): string {
  if (value === null) return "(not recorded)";
  const human = formatHumanTimestamp(value);
  return human ? `${human} (${value})` : value;
}

/** Human-readable duration: milliseconds under a second, otherwise seconds
 * (one decimal place, dropped when whole) up to a minute, then minutes and
 * seconds, then hours and minutes. `null` (duration never recorded) reads as
 * "(unknown)". */
function formatHumanDuration(ms: number | null): string {
  if (ms === null) return "(unknown)";
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    const rounded = Math.round(totalSeconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remSeconds = Math.round(totalSeconds - totalMinutes * 60);
  if (totalMinutes < 60) {
    return remSeconds > 0 ? `${totalMinutes}m ${remSeconds}s` : `${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes - totalHours * 60;
  return remMinutes > 0 ? `${totalHours}h ${remMinutes}m` : `${totalHours}h`;
}

/** The human duration PLUS the exact raw millisecond count in parens - same
 * "readable form alongside the precise value" rule as formatTimestamp. */
function formatDuration(ms: number | null): string {
  if (ms === null) return "(unknown)";
  return `${formatHumanDuration(ms)} (${ms}ms)`;
}

function formatCount(value: number | null): string {
  return value === null ? "(unknown)" : String(value);
}

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

/** Splits a multi-line field into indented lines, one per source line, so a
 * value that already contains "\n" (a multi-repo summary rendered one item
 * per line by summaryToLogText, a multi-line error) is indented consistently
 * on EVERY line rather than only its first - a bare `"    " + text` would
 * leave every line after the first flush against the margin. Blank lines
 * (paragraph/entry separators the source deliberately inserted) are kept
 * fully blank rather than padded with trailing whitespace. */
function indentLines(text: string, indent: string): string[] {
  return text.split("\n").map((l) => (l.length > 0 ? `${indent}${l}` : ""));
}

/** The course label for a step's metadata block: "<name> (<id>)" when the
 * name was captured, else the bare id (the fallback for a row written before
 * courseName existed - see WorkflowRunStep.courseName's doc comment) - never
 * a bare id when a name is available, per this feature's defect report.
 * Null when the step has no course at all (not a course fan-out). */
/** A step that completed (status "done" - it did not throw, and RCA19's
 * graceful degradation is unchanged: nothing here touches cascade behavior
 * in server-runner.ts) yet still carries a non-null `error` string is a
 * PARTIAL failure (U7-AC2, run 2f4aea3c: the log said "Status: ok, Error
 * count: 0" while 15 of 16 weekly announcements had failed inside a step
 * that itself reported DONE). Distinguished from an outright step failure
 * (status "error") purely by status, so this is a rendering-only signal - it
 * changes what the log SHOWS, never what actually ran or what a dependent
 * step received. */
function isPartialFailureStep(step: WorkflowRunStep): boolean {
  return step.status === "done" && !!step.error;
}

function courseFieldValue(step: WorkflowRunStep): string | null {
  if (step.courseName) return step.courseId ? `${step.courseName} (${step.courseId})` : step.courseName;
  return step.courseId;
}

/** What identifies WHICH fan-out iteration a step ran for, for the
 * scannable step header (AC2): "<institution>: <course>", just the
 * institution, or just the course, matching the "<inst>: <course>" label
 * convention used elsewhere for a composed fan-out group
 * (workflows/fanout.ts's composedGroupLabel) - kept as an inline literal
 * here rather than importing that helper, so this module keeps zero runtime
 * dependencies beyond its type-only WorkflowRunRecord/WorkflowRunStep
 * import. Null for a non-fan-out step (nothing to distinguish it by). */
function iterationLabel(step: WorkflowRunStep): string | null {
  const course = step.courseName || step.courseId || null;
  if (step.institution && course) return `${step.institution}: ${course}`;
  return step.institution || course || null;
}

/** joinStepErrorDetail (run-detail.ts) joins failure entries with "; ",
 * where every entry begins "step <n> <type>: ", EXCEPT two trailing summary
 * shapes that never name a step of their own: the omitted-count marker
 * "(+N more)", and (AC3 of the defect-1 write-up) the cascade-collapse
 * marker "N step(s) skipped as a result", which stands in for however many
 * "Skipped - depends on step..." entries a run's cascades produced. Splitting
 * only at a "; " that starts one of those three shapes - rather than at
 * every "; " - keeps a semicolon embedded inside a single error MESSAGE from
 * fragmenting that message into two bullets. This never changes what
 * joinStepErrorDetail itself produces (that string is also truncated into
 * workflow_schedules/triggers' last_run_detail snippet elsewhere, and must
 * not regress there) - it only re-splits the same string for display here. */
function splitDetailEntries(detail: string): string[] {
  return detail.split(/; (?=step \d+ \S|\(\+\d+ more\)$|\d+ steps? skipped as a result$)/);
}

/** Renders the run-level Detail block as one bulleted line per failure
 * entry instead of one long semicolon-separated paragraph (AC6), keeping the
 * full untruncated text (AC5) - splitting and indenting never drops or
 * rewords a character of it. */
function renderDetail(detail: string): string[] {
  return splitDetailEntries(detail).flatMap((entry) =>
    entry.split("\n").map((l, i) => (i === 0 ? `  - ${l}` : `    ${l}`))
  );
}

/** Renders a redacted input/field-value map as one bulleted "key: value"
 * line per entry, in the map's own key order (insertion order - the order
 * redactRunInputs processed them in, itself the order the step/run resolved
 * them in). `bulletIndent` matches this module's existing "label indent + 2
 * spaces" nesting rule: a top-level section (its own label at 0-indent, like
 * "Detail:") bullets at "  " same as renderDetail's "  - " bullets; a
 * step-nested section (its label at 2-indent, like "  Progress:") bullets at
 * "    " same as Progress's "    - " bullets. A value containing embedded
 * newlines (an unredacted multi-line "longtext" input) gets its
 * continuation lines indented two further spaces under the bullet, same
 * discipline as indentLines/renderDetail elsewhere in this module - a bare
 * concatenation would leave line 2+ flush against the margin. Every key
 * present on the map renders a line, INCLUDING one whose value is the
 * "(empty)" marker - that visibility is the whole point (AC1): an absent
 * line and an empty value must stay distinguishable, so this function never
 * filters a key out based on its value. */
function renderKeyValueBullets(map: Record<string, string>, bulletIndent: string): string[] {
  const out: string[] = [];
  const continuationIndent = `${bulletIndent}  `;
  for (const [key, value] of Object.entries(map)) {
    const valueLines = value.split("\n");
    out.push(`${bulletIndent}- ${key}: ${valueLines[0]}`);
    for (let i = 1; i < valueLines.length; i++) {
      out.push(`${continuationIndent}${valueLines[i]}`);
    }
  }
  return out;
}

/** Chronological order, not insertion/index order (AC3: a fan-out reuses the
 * SAME step index once per iteration, so index order does not reflect when
 * things actually happened - a log read top to bottom must be in the order
 * things happened). A step with no recorded startedAt (or an unparseable
 * one) cannot be placed in time, so it sorts after every timestamped step
 * rather than defaulting to the front; ties - including "neither side has a
 * timestamp" - preserve the ORIGINAL array position the caller passed in,
 * so a normal single-pass run (whose steps typically log very close or
 * identical instants) still reads top to bottom exactly as given. */
function sortStepsChronologically(steps: WorkflowRunStep[]): WorkflowRunStep[] {
  return steps
    .map((step, originalIndex) => {
      const parsed = step.startedAt === null ? NaN : Date.parse(step.startedAt);
      return { step, originalIndex, time: Number.isNaN(parsed) ? null : parsed };
    })
    .sort((a, b) => {
      if (a.time !== null && b.time !== null && a.time !== b.time) return a.time - b.time;
      if ((a.time === null) !== (b.time === null)) return a.time === null ? 1 : -1;
      return a.originalIndex - b.originalIndex;
    })
    .map((x) => x.step);
}

function renderStep(step: WorkflowRunStep): string[] {
  const out: string[] = [];

  const headerParts = [`[${step.stepIndex}] ${step.stepType}`];
  const iteration = iterationLabel(step);
  if (iteration) headerParts.push(iteration);
  // U7-AC2: a step that finished with SOME of its own work failed reads as a
  // bare "DONE" otherwise - indistinguishable from a step where everything
  // succeeded. "DONE (PARTIAL)" surfaces it in the one line of this block an
  // instructor scanning the log is most likely to actually read.
  headerParts.push(isPartialFailureStep(step) ? "DONE (PARTIAL)" : step.status.toUpperCase());
  headerParts.push(formatHumanDuration(step.durationMs));

  out.push(MAJOR_RULE);
  out.push(headerParts.join(" - "));
  out.push(MAJOR_RULE);

  out.push(line("  Duration", formatDuration(step.durationMs)));
  out.push(line("  Started at", formatTimestamp(step.startedAt)));
  out.push(line("  Finished at", formatTimestamp(step.finishedAt)));
  if (step.institution) out.push(line("  Institution", step.institution));
  const courseValue = courseFieldValue(step);
  if (courseValue) out.push(line("  Course", courseValue));

  // What this step actually RECEIVED (AC1) - rendered right after the
  // metadata block and BEFORE progress/error/summary, so a reader
  // diagnosing "what did this step actually get" sees it before the
  // narrative of what happened. Absent entirely (no divider, no heading)
  // for a step with nothing recorded - a pre-migration row (step.inputs
  // null) or a step with zero inputs must never render an empty or
  // misleading "Inputs:" section (AC5).
  if (step.inputs && Object.keys(step.inputs).length > 0) {
    out.push(MINOR_RULE);
    out.push("  Inputs:");
    out.push(...renderKeyValueBullets(step.inputs, "    "));
  }

  if (step.progress.length > 0) {
    out.push(MINOR_RULE);
    out.push("  Progress:");
    for (const message of step.progress) {
      out.push(`    - ${message}`);
    }
  }
  if (step.error) {
    out.push(MINOR_RULE);
    out.push("  Error:");
    out.push(...indentLines(step.error, "    "));
  }
  if (step.summary) {
    out.push(MINOR_RULE);
    out.push("  Summary:");
    out.push(...indentLines(step.summary, "    "));
  }
  return out;
}

/** Render the full plain-text run log: a header describing the run, one
 * block per step in CHRONOLOGICAL order (startedAt ascending - see
 * sortStepsChronologically; callers may pass listRunSteps' index-ordered
 * result as-is, this function does its own reordering), and a trailing
 * footer that calls out a run with no finish record (killed by a time cap,
 * crashed, or otherwise interrupted before it could finish). Plain text, no
 * markdown - see this module's header comment for the divider/timezone
 * rules. */
export function buildRunLogText(run: WorkflowRunRecord, steps: WorkflowRunStep[]): string {
  const lines: string[] = [];

  lines.push(MAJOR_RULE);
  lines.push(`Workflow run log: ${run.workflowName} (${run.workflowId})`);
  lines.push(MAJOR_RULE);
  lines.push(line("Run id", run.id));
  lines.push(line("Trigger source", run.triggerSource ?? "(unknown)"));
  lines.push(line("Trigger ref", run.triggerRef ?? "(none)"));

  // U7-AC2: `run.status`/`run.errorCount` are computed by the runner/route
  // BEFORE this log is ever rendered, filtering on each step's stored
  // `status` alone - a step that gracefully degrades (RCA19: some of its own
  // units of work failed, but the step itself did not throw, so dependents
  // still get its outputs) is "done" there, identical to a step where
  // nothing failed at all. Recounted HERE from the steps this function was
  // actually given, and folded into both header lines, so the header itself
  // can never read "Status: ok, Error count: 0" while a step's own body
  // shows most of its work failed - the stored values are never mutated,
  // only what this rendering shows.
  const partialFailureCount = steps.filter(isPartialFailureStep).length;
  const statusDisplay =
    partialFailureCount > 0
      ? `${run.status} (${partialFailureCount} step${partialFailureCount === 1 ? "" : "s"} partially failed)`
      : run.status;
  const errorCountDisplay =
    run.errorCount === null && partialFailureCount === 0
      ? formatCount(null)
      : formatCount((run.errorCount ?? 0) + partialFailureCount);

  lines.push(line("Status", statusDisplay));
  lines.push(line("Started at", formatTimestamp(run.startedAt)));
  lines.push(line("Finished at", formatTimestamp(run.finishedAt)));
  lines.push(line("Duration", formatDuration(run.durationMs)));
  lines.push(line("Step count", formatCount(run.stepCount)));
  lines.push(line("Error count", errorCountDisplay));

  // What the RUN itself started from (AC3) - an attended run's form values,
  // or a schedule/trigger's stored field_values snapshot at the moment the
  // run started. Absent entirely for a run with none recorded (a
  // pre-migration row, or a run with no field values at all) - same "no
  // section rather than an empty one" rule as the per-step Inputs block.
  if (run.fieldValues && Object.keys(run.fieldValues).length > 0) {
    lines.push(MINOR_RULE);
    lines.push("Field values:");
    lines.push(...renderKeyValueBullets(run.fieldValues, "  "));
  }

  if (run.detail) {
    lines.push(MINOR_RULE);
    lines.push("Detail:");
    lines.push(...renderDetail(run.detail));
  }

  const orderedSteps = sortStepsChronologically(steps);

  lines.push(MAJOR_RULE);
  lines.push(`Steps (${orderedSteps.length}):`);
  if (orderedSteps.length === 0) {
    lines.push("(no steps recorded)");
  }
  for (const step of orderedSteps) {
    lines.push("");
    lines.push(...renderStep(step));
  }

  lines.push(MAJOR_RULE);
  if (!run.finishedAt) {
    lines.push(
      "This run has no finish record: it did not complete (killed by a time limit, a crash, or an interruption)."
    );
  }

  return lines.join("\n");
}
