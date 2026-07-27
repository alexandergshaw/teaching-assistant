// Pure text assembly for the "generate a test from a saved template" workflow
// step (steps.assignments-test-template.ts): the LLM objectives/context
// strings, plus the finished test document, answer key, and study guide text.
// No I/O, no Date, no randomness - everything here is a deterministic function
// of its inputs, so it is unit-testable without mocking a server action.

import type { TestSpec, TestQuestionKind } from "@/lib/artifact-templates/types";
import { TECHNICAL_APTITUDES, TEST_FORMATS, TEST_QUESTION_KINDS, testTotalPoints } from "@/lib/artifact-templates/types";

export interface TestBriefContext {
  courseName: string;
  topic: string; // the week/module topic, may be ""
  weekLabel: string; // e.g. "Week 7" or "", for titles
}

// A single generated question, matching TestQuestionsData's shape
// (src/app/actions-types.ts) - defined inline here (rather than imported)
// so this module stays independent of the app/ layer, matching how
// assignment-brief.ts takes its AssignmentData shape inline.
export interface TestBriefQuestion {
  kind: TestQuestionKind;
  prompt: string;
  choices: string[];
  answer: string;
  points: number;
}

export interface TestBriefData {
  title: string;
  instructions: string;
  questions: TestBriefQuestion[];
}

// Marks where the answer key begins so it is never assembled onto the same
// page as question 1. buildDocxFromPlainText has no dedicated page-break
// syntax; this is a plain-text convention a future docx pass can honor.
const PAGE_BREAK_MARKER = "\f";

/** The objectives string handed to generateTestQuestionsAction: the resolved
 * topic (when known) plus the template's own goal. */
export function buildTestObjectives(spec: TestSpec, ctx: TestBriefContext): string {
  const lines: string[] = [];
  if (ctx.topic.trim()) {
    lines.push(`Topic: ${ctx.topic.trim()}`);
  }
  if (spec.goal.trim()) {
    lines.push(spec.goal.trim());
  }
  return lines.join("\n");
}

/**
 * The context string handed to generateTestQuestionsAction / the essay-rubric
 * generator - carries the spec's constraints as prose.
 *
 * Incorporates the aptitude and format `promptContract` strings VERBATIM
 * (looked up in TECHNICAL_APTITUDES / TEST_FORMATS) rather than
 * re-describing them: that contract string is the single source of truth
 * for what each vocabulary value means to the model, so copying it here
 * keeps the vocabulary and the prompt from drifting apart.
 */
export function buildTestContext(spec: TestSpec, ctx: TestBriefContext): string {
  const lines: string[] = [];

  if (spec.coverage.trim()) {
    lines.push(`Coverage: ${spec.coverage.trim()}`);
  }

  const aptitude = TECHNICAL_APTITUDES.find((a) => a.value === spec.aptitude);
  if (aptitude) {
    lines.push(aptitude.promptContract);
  }

  const format = TEST_FORMATS.find((f) => f.value === spec.format);
  if (format) {
    lines.push(format.promptContract);
  }

  lines.push(`Time budget: about ${spec.minutes} minute(s).`);

  if (spec.allowedResources.length > 0) {
    lines.push(`Allowed resources: ${spec.allowedResources.join("; ")}.`);
  }

  if (ctx.weekLabel.trim()) {
    lines.push(`This test is for ${ctx.weekLabel.trim()}.`);
  }

  return lines.join("\n");
}

/**
 * The finished, student-facing test text, assembled from the generated
 * TestBriefData plus the spec's own constraints. Markdown-ish text suitable
 * for buildDocxFromPlainText: a title line, an "## Instructions" block
 * stating the time budget, total points (via testTotalPoints - the single
 * source of truth), and allowed resources, then one "## " section per spec
 * section IN SPEC ORDER, with questions numbered continuously across
 * sections. Multiple-choice choices render as "a) b) c)"; essay questions get
 * a blank response-area marker. An empty section list, empty
 * allowedResources, or a section with zero matched questions omits its
 * heading/line entirely rather than emitting an empty one.
 *
 * `totalPointsOverride` replaces the spec-derived total on the Instructions
 * line when supplied. The step's "Points possible" input is the only caller
 * that passes it, and this document is the ONLY place that override can take
 * effect: Canvas discards a classic quiz's points_possible and computes the
 * total from its questions instead (see createGradable's Quiz branch in
 * canvas-modules/gradables.ts), so without this the input would silently do
 * nothing. `testTotalPoints` remains the source of truth for the default.
 */
export function renderTestDocument(
  data: TestBriefData,
  spec: TestSpec,
  ctx: TestBriefContext,
  totalPointsOverride?: number | null
): string {
  const lines: string[] = [];

  const titlePrefix = ctx.weekLabel.trim() ? `${ctx.weekLabel.trim()}: ` : "";
  lines.push(`# ${titlePrefix}${data.title}`);
  lines.push("");

  const totalPoints =
    typeof totalPointsOverride === "number" && Number.isFinite(totalPointsOverride)
      ? totalPointsOverride
      : testTotalPoints(spec);

  lines.push("## Instructions");
  lines.push(`Time allowed: about ${spec.minutes} minute(s).`);
  lines.push(`Total points: ${totalPoints}.`);
  if (spec.allowedResources.length > 0) {
    lines.push(`Allowed resources: ${spec.allowedResources.join("; ")}.`);
  }
  if (data.instructions.trim()) {
    lines.push(data.instructions.trim());
  }
  lines.push("");

  // Questions are consumed positionally from `data.questions` in the same
  // order the sections were requested (see generateTestQuestionsAction's
  // prompt, which states each section's count/points by name and order) -
  // section N's slice is the next `section.count` items in the flat array.
  let cursor = 0;
  let questionNumber = 0;
  for (const section of spec.sections) {
    const sectionQuestions = data.questions.slice(cursor, cursor + section.count);
    cursor += section.count;
    if (sectionQuestions.length === 0) continue;

    const kindDef = TEST_QUESTION_KINDS.find((k) => k.value === section.kind);
    lines.push(`## ${kindDef?.label ?? section.kind}`);
    for (const q of sectionQuestions) {
      questionNumber += 1;
      lines.push(`${questionNumber}. (${q.points} point(s)) ${q.prompt}`);
      if (q.kind === "multiple_choice") {
        q.choices.forEach((choice, i) => {
          lines.push(`   ${String.fromCharCode(97 + i)}) ${choice}`);
        });
      } else if (q.kind === "essay") {
        lines.push("   [Write your response below.]");
        lines.push("   ________________________________________");
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * The answer key, emitted only when the caller decides spec.includeAnswerKey
 * is on (mirroring how the step decides includeOpener/includeCloser in
 * assignment-brief.ts - this module never reads the toggle itself). Numbered
 * in the same flat order as `data.questions`, which matches
 * renderTestDocument's continuous numbering across sections. Appended after a
 * page-break marker so the key never lands on the same page as question 1.
 * Returns "" when there are no questions, so an empty key section is never
 * appended.
 */
export function renderTestAnswerKey(data: TestBriefData): string {
  if (data.questions.length === 0) return "";
  const lines: string[] = [PAGE_BREAK_MARKER, "## Answer Key", ""];
  data.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.answer}`);
  });
  return lines.join("\n");
}

/**
 * A deterministic, spec-derived review checklist: the coverage topics plus
 * one line per section describing what to practice. Built with no LLM call,
 * so it can never echo the generated questions (mirroring
 * renderAssignmentCloser in assignment-brief.ts, which is deterministic for
 * the same reason). Emitted only when the caller decides
 * spec.includeStudyGuide is on.
 */
export function renderTestStudyGuide(spec: TestSpec, ctx: TestBriefContext): string {
  const lines: string[] = ["## Study Guide", ""];

  if (spec.coverage.trim()) {
    lines.push(`Review: ${spec.coverage.trim()}`);
    lines.push("");
  }

  if (spec.sections.length > 0) {
    lines.push("Practice the following before the test:");
    for (const section of spec.sections) {
      const kindDef = TEST_QUESTION_KINDS.find((k) => k.value === section.kind);
      const label = kindDef?.label ?? section.kind;
      lines.push(`- [ ] ${section.count} ${label} question(s) (${section.pointsEach} point(s) each)`);
    }
  }

  if (ctx.weekLabel.trim()) {
    lines.push("");
    lines.push(`This test covers material through ${ctx.weekLabel.trim()}.`);
  }

  return lines.join("\n").trim();
}
